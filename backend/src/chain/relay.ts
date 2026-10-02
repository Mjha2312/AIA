import { AbiCoder, Contract, JsonRpcProvider, keccak256, Wallet } from "ethers";
import { logger } from "../logger.js";
import { artifactPaths, fileExists, loadDeployment, loadManagerInterface } from "./artifacts.js";
import { TxTimeoutError, isNonceError } from "./errors.js";

export interface SemaphoreProofJson {
  merkleTreeDepth: string;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  points: string[];
}

/** Phase enum per ElectionManager: Setup=0, Registration=1, Voting=2, ... */
export const VOTING_PHASE = 2;

export interface ElectionSnapshot {
  exists: boolean;
  phase: number;
  candidateCount: number;
}

export interface ElectionDetails {
  constituencyId: string;
  candidates: string[];
}

export interface Relayer {
  getElection(electionId: string): Promise<ElectionSnapshot>;
  getElectionDetails?(electionId: string): Promise<ElectionDetails | null>;
  castVote(
    electionId: string,
    candidateIndex: string,
    proof: SemaphoreProofJson,
  ): Promise<{ txHash: string; voteHash: string }>;
}

/**
 * voteHash = keccak256(abi.encode(electionId, nullifier, candidateIndex)),
 * exactly as ElectionManager.castVote computes it.
 */
export function computeVoteHash(
  electionId: string,
  nullifier: string,
  candidateIndex: string,
): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256"],
      [electionId, nullifier, candidateIndex],
    ),
  );
}

/**
 * Serializes async work to concurrency 1 per relayer wallet. Concurrent HTTP
 * requests queue here instead of racing on nonces.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((res) => {
      release = res;
    });
    const result = prev.then(() => fn());
    // The queue itself never rejects; callers observe `result`.
    result.then(release, release);
    return result as Promise<T>;
  }
}

/**
 * Tracks the relayer nonce locally so queued votes do not collide.
 * Resyncs from the network on first use and after nonce errors.
 */
export class NonceManager {
  private next: number | null = null;

  async take(provider: JsonRpcProvider, address: string): Promise<number> {
    if (this.next === null) {
      this.next = await provider.getTransactionCount(address, "pending");
    }
    const nonce = this.next;
    this.next += 1;
    return nonce;
  }

  reset(): void {
    this.next = null;
  }
}

/** Live relayer: submits ElectionManager.castVote via RELAYER_PRIVATE_KEY. */
export class EthersRelayer implements Relayer {
  private constructor(
    private readonly contract: Contract,
    private readonly provider: JsonRpcProvider,
    private readonly address: string,
    private readonly txTimeoutMs: number,
    private readonly queue: SerialQueue = new SerialQueue(),
    private readonly nonces: NonceManager = new NonceManager(),
  ) {}

  static async fromEnv(opts: {
    rpcUrl: string;
    relayerKey: string;
    chainId: number;
    txTimeoutMs: number;
  }): Promise<EthersRelayer> {
    const deployment = await loadDeployment();
    if (!deployment.ElectionManager) throw new Error("ElectionManager address missing in deployment file");
    const iface = await loadManagerInterface();
    const provider = new JsonRpcProvider(opts.rpcUrl, opts.chainId);
    const wallet = new Wallet(opts.relayerKey, provider);
    const contract = new Contract(deployment.ElectionManager, iface, wallet);
    return new EthersRelayer(contract, provider, wallet.address, opts.txTimeoutMs);
  }

  async getElection(electionId: string): Promise<ElectionSnapshot> {
    try {
      const [constituencyId, candidates, phase] = (await this.contract.getElection(electionId)) as [
        string,
        string[],
        bigint,
      ];
      void constituencyId;
      return { exists: true, phase: Number(phase), candidateCount: candidates.length };
    } catch (err) {
      if ((err as Error).message.includes("ElectionNotFound")) throw err;
      // getElection reverts ElectionNotFound for unknown ids; CALL_EXCEPTION
      // without a decoded reason means the same — treat as missing.
      const code = (err as { code?: string }).code;
      if (code === "CALL_EXCEPTION") return { exists: false, phase: 0, candidateCount: 0 };
      throw err;
    }
  }

  async getElectionDetails(electionId: string): Promise<ElectionDetails | null> {
    try {
      const [constituencyId, candidates] = (await this.contract.getElection(electionId)) as [
        string,
        string[],
      ];
      return { constituencyId, candidates: [...candidates] };
    } catch {
      return null;
    }
  }

  async castVote(
    electionId: string,
    candidateIndex: string,
    proof: SemaphoreProofJson,
  ): Promise<{ txHash: string; voteHash: string }> {
    return this.queue.run(async () => {
      const nonce = await this.nonces.take(this.provider, this.address);
      let txHash: string;
      try {
        const tx = (await this.contract.castVote(electionId, candidateIndex, { ...proof }, { nonce })) as {
          hash: string;
          wait: (confirms?: number) => Promise<unknown>;
        };
        txHash = tx.hash;
        await this.waitMined(tx, txHash);
      } catch (err) {
        if (isNonceError(err)) this.nonces.reset();
        throw err;
      }
      return { txHash, voteHash: computeVoteHash(electionId, proof.nullifier, candidateIndex) };
    });
  }

  private async waitMined(
    tx: { wait: (confirms?: number) => Promise<unknown> },
    txHash: string,
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TxTimeoutError(txHash)), this.txTimeoutMs);
      });
      await Promise.race([tx.wait(1), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** In-memory fake relayer: deterministic, no chain needed. */
export class FakeRelayer implements Relayer {
  public elections = new Map<string, { phase: number; candidateCount: number }>();
  public calls: Array<{ electionId: string; candidateIndex: string; proof: SemaphoreProofJson }> = [];
  /** One-shot raw failure (e.g. revertErrorForName(...)) thrown by next castVote. */
  public failNextWith: unknown = null;
  /** One-shot artificial delay (ms) applied inside the queue — tests queueing. */
  public delayNextMs = 0;

  async getElection(electionId: string): Promise<ElectionSnapshot> {
    const e = this.elections.get(electionId);
    if (!e) return { exists: false, phase: 0, candidateCount: 0 };
    return { exists: true, phase: e.phase, candidateCount: e.candidateCount };
  }

  async castVote(
    electionId: string,
    candidateIndex: string,
    proof: SemaphoreProofJson,
  ): Promise<{ txHash: string; voteHash: string }> {
    this.calls.push({ electionId, candidateIndex, proof });
    if (this.delayNextMs > 0) {
      const ms = this.delayNextMs;
      this.delayNextMs = 0;
      await new Promise((res) => setTimeout(res, ms));
    }
    if (this.failNextWith !== null) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    const n = this.calls.length;
    return {
      txHash: `0xfakevote${n.toString(16).padStart(8, "0")}`,
      voteHash: computeVoteHash(electionId, proof.nullifier, candidateIndex),
    };
  }
}

export async function selectRelayer(opts: {
  chainMode: "auto" | "fake" | "live";
  rpcUrl: string;
  relayerKey: string;
  chainId: number;
  txTimeoutMs: number;
}): Promise<Relayer> {
  if (opts.chainMode === "fake") {
    logger.info("Using FakeRelayer (CHAIN_MODE=fake)");
    return new FakeRelayer();
  }
  if (opts.chainMode === "live") {
    return EthersRelayer.fromEnv(opts);
  }
  const { managerAbiPath, deploymentPath } = artifactPaths();
  if ((await fileExists(managerAbiPath)) && (await fileExists(deploymentPath))) {
    try {
      const relayer = await EthersRelayer.fromEnv(opts);
      logger.info("Using EthersRelayer (contract artifacts found)");
      return relayer;
    } catch (err) {
      logger.warn({ err }, "Falling back to FakeRelayer: live relayer init failed");
      return new FakeRelayer();
    }
  }
  logger.info("Using FakeRelayer (no contract artifacts found)");
  return new FakeRelayer();
}
