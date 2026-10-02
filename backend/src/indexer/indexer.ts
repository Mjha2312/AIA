import type { Interface } from "ethers";
import { logger } from "../logger.js";
import type { WsHub } from "../ws.js";
import type { ChainLog, ElectionDetailsInput } from "./types.js";
import type { EventSource, Unsubscriber } from "./source.js";
import type { IndexerStore } from "./store.js";

export interface IndexerOptions {
  /** First block to backfill from when no checkpoint exists. */
  fromBlock?: number;
  /** Max blocks per getPastLogs call during backfill. */
  backfillChunkSize?: number;
  /** Reconnect delays (ms); tests inject tiny values. Default: backoff to 30s. */
  retryDelays?: number[];
  /** Optional enrichment for ElectionCreated (candidates are not in the event). */
  fetchElectionDetails?: (electionId: string) => Promise<ElectionDetailsInput | null>;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

/**
 * Subscribes to ElectionManager events, persists them idempotently, and
 * broadcasts normalized VoteCast/PhaseChanged/VoterRegistered events.
 *
 * Lifecycle: backfill [lastCheckpoint+1 .. head] in chunks, then go live.
 * On socket drops, resubscribe with backoff after re-backfilling the gap.
 * Replays are safe: every write is idempotent on (txHash, logIndex).
 */
export class Indexer {
  private stopped = false;
  private started = false;
  private unsubscribe: Unsubscriber | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryAttempt = 0;

  constructor(
    private readonly source: EventSource,
    private readonly store: IndexerStore,
    private readonly iface: Interface,
    private readonly hub: Pick<WsHub, "broadcast"> | null,
    private readonly opts: IndexerOptions = {},
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    await this.backfillToHead();
    if (!this.stopped) await this.subscribeLive();
  }

  /**
   * Backfill from the stored checkpoint (or fromBlock) to head without
   * subscribing live. Used by `npm run dev:replay` for one-shot replays.
   */
  async runOnce(): Promise<void> {
    this.stopped = false;
    await this.backfillToHead();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    await this.source.destroy();
  }

  private get retryDelays(): number[] {
    return this.opts.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  private async backfillToHead(): Promise<void> {
    const checkpoint = await this.store.getLastProcessedBlock();
    let from = Math.max(checkpoint === null ? (this.opts.fromBlock ?? 0) : checkpoint + 1, 0);
    const head = await this.source.getLatestBlock();
    const chunk = Math.max(this.opts.backfillChunkSize ?? 2000, 1);
    while (from <= head && !this.stopped) {
      const to = Math.min(from + chunk - 1, head);
      const logs = await this.source.getPastLogs(from, to);
      for (const log of logs) {
        await this.processLog(log);
      }
      await this.store.setLastProcessedBlock(to);
      from = to + 1;
    }
  }

  private async subscribeLive(): Promise<void> {
    if (this.stopped) return;
    this.unsubscribe = await this.source.subscribe(
      (log) => {
        void this.processLog(log)
          .then(() => this.store.setLastProcessedBlock(log.blockNumber))
          .catch((err: unknown) => {
            logger.warn({ err }, "indexer failed to process live log");
          });
      },
      () => {
        void this.handleDrop();
      },
    );
  }

  private async handleDrop(): Promise<void> {
    if (this.stopped) return;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    const delay = this.retryDelays[Math.min(this.retryAttempt, this.retryDelays.length - 1)];
    this.retryAttempt += 1;
    logger.warn({ delayMs: delay, attempt: this.retryAttempt }, "indexer connection dropped; reconnecting");
    await new Promise<void>((resolve) => {
      this.retryTimer = setTimeout(resolve, delay);
    });
    this.retryTimer = null;
    if (this.stopped) return;
    try {
      // Re-backfill the gap first (idempotent), then resume live.
      await this.backfillToHead();
      if (!this.stopped) await this.subscribeLive();
    } catch (err) {
      logger.warn({ err }, "indexer reconnect backfill failed; retrying");
      await this.handleDrop();
    }
  }

  private async processLog(log: ChainLog): Promise<void> {
    let parsed: ReturnType<Interface["parseLog"]>;
    try {
      parsed = this.iface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      return; // Not an ElectionManager event (e.g. Semaphore internals).
    }
    if (!parsed) return;
    switch (parsed.name) {
      case "ElectionCreated": {
        const electionId = (parsed.args[0] as bigint).toString();
        const constituencyId = parsed.args[1] as string;
        await this.store.ensureElection(electionId, constituencyId);
        if (this.opts.fetchElectionDetails) {
          const details = await this.opts.fetchElectionDetails(electionId).catch(() => null);
          if (details) await this.store.setElectionDetails(electionId, details);
        }
        break;
      }
      case "PhaseChanged": {
        const electionId = (parsed.args[0] as bigint).toString();
        const newPhase = Number(parsed.args[1]);
        await this.store.ensureElection(electionId, "");
        const inserted = await this.store.addPhaseChange(electionId, newPhase, log.transactionHash, log.logIndex, log.blockNumber);
        if (inserted) {
          await this.store.setPhase(electionId, newPhase);
          this.hub?.broadcast({
            type: "PhaseChanged",
            electionId,
            newPhase,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
        break;
      }
      case "VoterRegistered": {
        const electionId = (parsed.args[0] as bigint).toString();
        const identityCommitment = (parsed.args[1] as bigint).toString();
        await this.store.ensureElection(electionId, "");
        const leafIndex = await this.store.memberCount(electionId);
        const { inserted } = await this.store.addMember({
          electionId,
          identityCommitment,
          leafIndex,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        });
        if (inserted) {
          await this.store.bumpRegistered(electionId);
          this.hub?.broadcast({
            type: "VoterRegistered",
            electionId,
            identityCommitment,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
        break;
      }
      case "VoteCast": {
        const electionId = (parsed.args[0] as bigint).toString();
        const nullifier = (parsed.args[1] as bigint).toString();
        const candidateIndex = Number(parsed.args[2]);
        const voteHash = parsed.args[3] as string;
        await this.store.ensureElection(electionId, "");
        const inserted = await this.store.addVote({
          voteHash,
          electionId,
          nullifier,
          candidateIndex,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
          blockTimestamp: log.blockTimestamp,
        });
        if (inserted) {
          await this.store.bumpVoted(electionId);
          this.hub?.broadcast({
            type: "VoteCast",
            electionId,
            nullifier,
            candidateIndex,
            voteHash,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }
        break;
      }
      case "TallyFinalized": {
        // advancePhase emits PhaseChanged(Finalized) alongside; this is a
        // backstop so the row converges to Finalized even if that log is missed.
        const electionId = (parsed.args[0] as bigint).toString();
        await this.store.ensureElection(electionId, "");
        await this.store.setPhase(electionId, 4);
        break;
      }
      default:
        break;
    }
  }
}
