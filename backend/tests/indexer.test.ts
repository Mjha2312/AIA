import { describe, it, expect } from "vitest";
import { Indexer } from "../src/indexer/indexer.js";
import { FakeEventSource } from "../src/indexer/source.js";
import { InMemoryIndexerStore } from "../src/indexer/store.js";
import type { ChainLog } from "../src/indexer/types.js";
import type { WsEvent } from "../src/ws.js";
import { loadManagerInterface } from "../src/chain/artifacts.js";
import { computeVoteHash } from "../src/chain/relay.js";
import type { Interface } from "ethers";

let seq = 0;

function makeLog(
  iface: Interface,
  event: string,
  args: unknown[],
  overrides: Partial<ChainLog> = {},
): ChainLog {
  const encoded = iface.encodeEventLog(event, args);
  seq += 1;
  return {
    address: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    transactionHash: overrides.transactionHash ?? `0xtx${seq.toString().padStart(4, "0")}`,
    logIndex: overrides.logIndex ?? 0,
    blockNumber: overrides.blockNumber ?? 100 + seq,
    blockTimestamp: new Date("2026-01-01T00:00:00Z"),
    topics: [...encoded.topics],
    data: encoded.data,
    ...overrides,
  };
}

function setup() {
  const source = new FakeEventSource();
  const store = new InMemoryIndexerStore();
  const events: WsEvent[] = [];
  const hub = { broadcast: (e: WsEvent) => void events.push(e) };
  return { source, store, events, hub };
}

async function startIndexer(
  source: FakeEventSource,
  store: InMemoryIndexerStore,
  hub: { broadcast: (e: WsEvent) => void },
  iface: Interface,
  fromBlock = 0,
) {
  const indexer = new Indexer(source, store, iface, hub, {
    fromBlock,
    backfillChunkSize: 5,
    retryDelays: [1, 1, 1],
  });
  await indexer.start();
  return indexer;
}

describe("Indexer", () => {
  it("backfills history into the store and broadcasts normalized events", async () => {
    const iface = await loadManagerInterface();
    const { source, store, events, hub } = setup();
    const voteHash = computeVoteHash("1", "555", "0");
    source.pastLogs = [
      makeLog(iface, "ElectionCreated", [1n, "Ward 12"], { blockNumber: 10 }),
      makeLog(iface, "PhaseChanged", [1n, 1], { blockNumber: 11 }),
      makeLog(iface, "VoterRegistered", [1n, 999n], { blockNumber: 12 }),
      makeLog(iface, "VoteCast", [1n, 555n, 0n, voteHash], { blockNumber: 13 }),
    ];
    source.latestBlock = 13;

    const indexer = await startIndexer(source, store, hub, iface);
    try {
      expect(store.getElection("1")).toMatchObject({ phase: 1, registered: 1, voted: 1 });
      expect(store.voteCount).toBe(1);
      expect(await store.getLastProcessedBlock()).toBe(13);
      expect(events.map((e) => e.type)).toEqual(["PhaseChanged", "VoterRegistered", "VoteCast"]);
      const vote = events.find((e) => e.type === "VoteCast");
      expect(vote).toMatchObject({ electionId: "1", nullifier: "555", candidateIndex: 0, voteHash });
      // Payloads carry chain-public data only — nothing KYC-linkable.
      expect(JSON.stringify(events)).not.toMatch(/subjectId|kycToken|aadhaar/i);
    } finally {
      await indexer.stop();
    }
  });

  it("is idempotent on (txHash, logIndex): replays insert and broadcast once", async () => {
    const iface = await loadManagerInterface();
    const { source, store, events, hub } = setup();
    const voteHash = computeVoteHash("2", "777", "1");
    const log = makeLog(iface, "VoteCast", [2n, 777n, 1n, voteHash], {
      transactionHash: "0xreplay",
      logIndex: 3,
      blockNumber: 20,
    });
    source.pastLogs = [log];
    source.latestBlock = 20;

    const indexer = await startIndexer(source, store, hub, iface);
    try {
      // Same log re-emitted live (as a reconnect replay would).
      source.emitLive({ ...log });
      await new Promise((r) => setTimeout(r, 20));
      expect(store.voteCount).toBe(1);
      expect(events.filter((e) => e.type === "VoteCast")).toHaveLength(1);
    } finally {
      await indexer.stop();
    }
  });

  it("processes live events after backfill", async () => {
    const iface = await loadManagerInterface();
    const { source, store, events, hub } = setup();
    source.latestBlock = 30;

    const indexer = await startIndexer(source, store, hub, iface, 30);
    try {
      source.emitLive(makeLog(iface, "PhaseChanged", [3n, 2], { blockNumber: 31 }));
      await new Promise((r) => setTimeout(r, 20));
      expect(store.getElection("3")).toMatchObject({ phase: 2 });
      expect(events).toHaveLength(1);
    } finally {
      await indexer.stop();
    }
  });

  it("reconnects with backoff and backfills the gap", async () => {
    const iface = await loadManagerInterface();
    const { source, store, events, hub } = setup();
    source.latestBlock = 40;

    const indexer = await startIndexer(source, store, hub, iface, 40);
    const subscribesBefore = source.subscribeCount;
    try {
      source.dropConnection();
      // Log lands while the socket is "down"; it is only in history.
      const gapLog = makeLog(iface, "VoterRegistered", [4n, 4242n], { blockNumber: 41 });
      source.pastLogs = [gapLog];
      source.latestBlock = 41;
      await new Promise((r) => setTimeout(r, 50));
      expect(source.subscribeCount).toBeGreaterThan(subscribesBefore);
      expect(store.getElection("4")).toMatchObject({ registered: 1 });
      expect(events.map((e) => e.type)).toEqual(["VoterRegistered"]);
    } finally {
      await indexer.stop();
    }
  });

  it("ignores logs it cannot decode", async () => {
    const iface = await loadManagerInterface();
    const { source, store, events, hub } = setup();
    source.pastLogs = [
      {
        address: "0x0000000000000000000000000000000000000000",
        transactionHash: "0xjunk",
        logIndex: 0,
        blockNumber: 50,
        blockTimestamp: null,
        topics: ["0xdeadbeef"],
        data: "0x",
      },
    ];
    source.latestBlock = 50;

    const indexer = await startIndexer(source, store, hub, iface, 50);
    try {
      expect(store.voteCount).toBe(0);
      expect(events).toHaveLength(0);
      expect(await store.getLastProcessedBlock()).toBe(50);
    } finally {
      await indexer.stop();
    }
  });
});
