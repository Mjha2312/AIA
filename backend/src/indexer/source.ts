import { Contract, WebSocketProvider, type Interface } from "ethers";
import { logger } from "../logger.js";
import type { ChainLog } from "./types.js";

export type Unsubscriber = () => void;
export type LogHandler = (log: ChainLog) => void;
export type DropHandler = (err: Error) => void;

/** Minimal ethers Log shape the indexer consumes (backfill + live). */
interface EthersLogShape {
  address: string;
  transactionHash: string;
  index: number;
  blockNumber: number;
  topics: string[];
  data: string;
}

/**
 * Chain log source. The indexer backfills via getPastLogs, then goes live
 * via subscribe; drops are reported through onDrop so it can reconnect.
 */
export interface EventSource {
  getPastLogs(fromBlock: number, toBlock: number): Promise<ChainLog[]>;
  getLatestBlock(): Promise<number>;
  subscribe(onLog: LogHandler, onDrop: DropHandler): Promise<Unsubscriber>;
  /**
   * Drop the underlying transport so the next use reconnects from scratch.
   * The indexer's watchdog calls this when the live path silently misses
   * blocks (ethers v6 never auto-reconnects a wedged socket, and close/error
   * events are not guaranteed to fire).
   */
  reconnect(): Promise<void>;
  destroy(): Promise<void>;
}

/** Live source over WS_RPC_URL (ethers v6 WebSocketProvider). */
export class EthersEventSource implements EventSource {
  private provider: WebSocketProvider | null = null;
  private contract: Contract | null = null;

  constructor(
    private readonly wsUrl: string,
    private readonly contractAddress: string,
    private readonly iface: Interface,
  ) {}

  private async ensureConnected(): Promise<{ provider: WebSocketProvider; contract: Contract }> {
    if (!this.provider || !this.contract) {
      const provider = new WebSocketProvider(this.wsUrl);
      // Fail fast if the socket is unreachable instead of hanging.
      await provider.getBlockNumber();
      this.provider = provider;
      this.contract = new Contract(this.contractAddress, this.iface, provider);
    }
    return { provider: this.provider, contract: this.contract };
  }

  /** Drop and recreate the underlying socket (used for reconnects). */
  async reconnect(): Promise<void> {
    await this.destroy();
  }

  async getPastLogs(fromBlock: number, toBlock: number): Promise<ChainLog[]> {
    const { contract, provider } = await this.ensureConnected();
    const raw = await contract.queryFilter("*", fromBlock, toBlock);
    const out: ChainLog[] = [];
    for (const entry of raw) {
      if (!("transactionHash" in entry)) continue;
      const block = await provider.getBlock(entry.blockNumber);
      out.push({
        address: entry.address,
        transactionHash: entry.transactionHash,
        logIndex: entry.index,
        blockNumber: entry.blockNumber,
        blockTimestamp: block ? new Date(block.timestamp * 1000) : null,
        topics: [...entry.topics],
        data: entry.data,
      });
    }
    return out;
  }

  async getLatestBlock(): Promise<number> {
    const { provider } = await this.ensureConnected();
    return provider.getBlockNumber();
  }

  async subscribe(onLog: LogHandler, onDrop: DropHandler): Promise<Unsubscriber> {
    const { contract, provider } = await this.ensureConnected();
    const listener = (...args: unknown[]): void => {
      // ethers v6 delivers "*" subscriptions as a single ContractEventPayload
      // ({ filter, emitter, log, args, fragment }) — not a bare Log. The live
      // log lives at .log; fall back to a bare log shape, then validate.
      const payload = args[args.length - 1] as
        | (EthersLogShape & { log?: EthersLogShape })
        | undefined;
      const entry = payload?.log ?? payload;
      if (
        !entry ||
        !Array.isArray(entry.topics) ||
        typeof entry.transactionHash !== "string" ||
        typeof entry.blockNumber !== "number"
      ) {
        logger.warn("indexer live log has unexpected shape — skipping");
        return;
      }
      const log: EthersLogShape = entry;
      void provider
        .getBlock(log.blockNumber)
        .then((block) => {
          onLog({
            address: log.address,
            transactionHash: log.transactionHash,
            logIndex: log.index,
            blockNumber: log.blockNumber,
            blockTimestamp: block ? new Date(block.timestamp * 1000) : null,
            topics: [...log.topics],
            data: log.data,
          });
        })
        .catch((err: unknown) => {
          logger.warn({ err }, "indexer live log handling failed");
        });
    };
    await contract.on("*", listener);

    const websocket = (provider as unknown as { websocket?: { onclose?: unknown; addEventListener?: (t: string, f: () => void) => void } }).websocket;
    const handleDrop = (): void => {
      onDrop(new Error("chain websocket dropped"));
    };
    if (websocket && typeof websocket.addEventListener === "function") {
      websocket.addEventListener("close", handleDrop);
      websocket.addEventListener("error", handleDrop);
    }
    return () => {
      void contract.off("*", listener).catch(() => undefined);
    };
  }

  async destroy(): Promise<void> {
    const provider = this.provider;
    this.provider = null;
    this.contract = null;
    if (provider) {
      await provider.destroy().catch(() => undefined);
    }
  }
}

/** In-memory source for tests: scripted history + manual live emission. */
export class FakeEventSource implements EventSource {
  public pastLogs: ChainLog[] = [];
  public latestBlock = 0;
  public subscribeCount = 0;
  public destroyed = false;
  private liveHandlers: LogHandler[] = [];
  private dropHandlers: DropHandler[] = [];

  async getPastLogs(fromBlock: number, toBlock: number): Promise<ChainLog[]> {
    return this.pastLogs
      .filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  }

  async getLatestBlock(): Promise<number> {
    return this.latestBlock;
  }

  async subscribe(onLog: LogHandler, onDrop: DropHandler): Promise<Unsubscriber> {
    this.subscribeCount += 1;
    this.liveHandlers.push(onLog);
    this.dropHandlers.push(onDrop);
    return () => {
      this.liveHandlers = this.liveHandlers.filter((h) => h !== onLog);
      this.dropHandlers = this.dropHandlers.filter((h) => h !== onDrop);
    };
  }

  /** Simulates a fresh socket: old listeners are gone, like after a reconnect. */
  public reconnectCount = 0;

  async reconnect(): Promise<void> {
    this.reconnectCount += 1;
    this.liveHandlers = [];
    this.dropHandlers = [];
  }

  emitLive(log: ChainLog): void {
    for (const h of [...this.liveHandlers]) h(log);
  }

  dropConnection(): void {
    for (const h of [...this.dropHandlers]) h(new Error("fake drop"));
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.liveHandlers = [];
    this.dropHandlers = [];
  }
}
