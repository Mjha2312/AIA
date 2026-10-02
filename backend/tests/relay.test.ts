import { describe, it, expect } from "vitest";
import request from "supertest";
import pino from "pino";
import { Writable } from "node:stream";
import { buildTestApp } from "./helpers.js";
import { createRelayLogger, RELAY_REDACT_PATHS } from "../src/logger.js";
import { computeVoteHash, NonceManager, SerialQueue, type SemaphoreProofJson } from "../src/chain/relay.js";
import { TxTimeoutError, isNonceError, relayFailureSummary, revertErrorForName } from "../src/chain/errors.js";
import { loadRelayDecodeInterface } from "../src/chain/artifacts.js";

function proof(overrides: Partial<SemaphoreProofJson> = {}): SemaphoreProofJson {
  return {
    merkleTreeDepth: "20",
    merkleTreeRoot: "111",
    nullifier: "222",
    message: "1",
    scope: "1",
    points: ["1", "2", "3", "4", "5", "6", "7", "8"],
    ...overrides,
  };
}

function votingApp(electionId = "1", candidateCount = 3) {
  const { app, ctx } = buildTestApp();
  ctx.relayer.elections.set(electionId, { phase: 2, candidateCount });
  return { app, ctx };
}

describe("POST /api/relay/vote", () => {
  it("happy path returns txHash and the contract-matching voteHash", async () => {
    const { app } = votingApp();
    const res = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBeTypeOf("string");
    expect(res.body.voteHash).toBe(computeVoteHash("1", "222", "1"));
  });

  it("rejects malformed proof with INVALID_REQUEST", async () => {
    const { app } = votingApp();
    const bad = proof({ points: ["1", "2"] as unknown as string[] });
    const res = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: bad });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects scope/message mismatch before touching the chain", async () => {
    const { app, ctx } = votingApp();
    const scopeRes = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof({ scope: "2" }) });
    expect(scopeRes.status).toBe(400);
    expect(scopeRes.body.error.code).toBe("SCOPE_MISMATCH");

    const msgRes = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof({ message: "0" }) });
    expect(msgRes.status).toBe(400);
    expect(msgRes.body.error.code).toBe("MESSAGE_MISMATCH");
    // Pre-checks run before any chain call.
    expect(ctx.relayer.calls).toHaveLength(0);
  });

  it("pre-checks: unknown election 404, wrong phase 409, bad candidate 400", async () => {
    const { app, ctx } = buildTestApp();
    ctx.relayer.elections.set("7", { phase: 1, candidateCount: 2 });

    const missing = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "9", candidateIndex: 0, proof: proof({ scope: "9", message: "0" }) });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ELECTION_NOT_FOUND");

    const phase = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "7", candidateIndex: 0, proof: proof({ scope: "7", message: "0" }) });
    expect(phase.status).toBe(409);
    expect(phase.body.error.code).toBe("WRONG_PHASE");

    ctx.relayer.elections.set("7", { phase: 2, candidateCount: 2 });
    const cand = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "7", candidateIndex: 5, proof: proof({ scope: "7", message: "5" }) });
    expect(cand.status).toBe(400);
    expect(cand.body.error.code).toBe("INVALID_CANDIDATE");
  });

  it("maps double-vote revert to 409 ALREADY_VOTED", async () => {
    const { app, ctx } = votingApp();
    const iface = await loadRelayDecodeInterface();
    ctx.relayer.failNextWith = revertErrorForName(iface, "Semaphore__YouAreUsingTheSameNullifierTwice");
    const res = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_VOTED");
  });

  it("maps invalid-proof revert to 400 INVALID_PROOF", async () => {
    const { app, ctx } = votingApp();
    const iface = await loadRelayDecodeInterface();
    ctx.relayer.failNextWith = revertErrorForName(iface, "Semaphore__InvalidProof");
    const res = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PROOF");
  });

  it("maps on-chain WrongPhase to 409 and unknown failures to 502", async () => {
    const { app, ctx } = votingApp();
    const iface = await loadRelayDecodeInterface();

    ctx.relayer.failNextWith = revertErrorForName(iface, "WrongPhase");
    const phased = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(phased.status).toBe(409);
    expect(phased.body.error.code).toBe("WRONG_PHASE");

    ctx.relayer.failNextWith = new Error("connection reset by peer");
    const broken = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(broken.status).toBe(502);
    expect(broken.body.error.code).toBe("CHAIN_ERROR");
  });

  it("maps mining timeout to 504 TX_TIMEOUT", async () => {
    const { app, ctx } = votingApp();
    ctx.relayer.failNextWith = new TxTimeoutError("0xdeadbeef");
    const res = await request(app)
      .post("/api/relay/vote")
      .send({ electionId: "1", candidateIndex: 1, proof: proof() });
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("TX_TIMEOUT");
  });
});

describe("SerialQueue", () => {
  it("runs work one at a time in order", async () => {
    const q = new SerialQueue();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        q.run(async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it("keeps serving after a rejection", async () => {
    const q = new SerialQueue();
    await expect(q.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(q.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

describe("NonceManager", () => {
  function fakeProvider(networkNonce: () => number) {
    return {
      getTransactionCount: async () => networkNonce(),
    } as unknown as Parameters<NonceManager["current"]>[0];
  }

  it("hands out the synced nonce and advances only on commit", async () => {
    const mgr = new NonceManager();
    let networkNonce = 7;
    const provider = fakeProvider(() => networkNonce);
    expect(await mgr.current(provider, "0xabc")).toBe(7);
    // Peeking twice without a broadcast keeps handing out the same nonce.
    expect(await mgr.current(provider, "0xabc")).toBe(7);
    mgr.commit();
    expect(await mgr.current(provider, "0xabc")).toBe(8);
    mgr.reset();
    networkNonce = 12;
    expect(await mgr.current(provider, "0xabc")).toBe(12);
  });

  it("reuses the same nonce after a pre-broadcast failure (no poisoning)", async () => {
    const mgr = new NonceManager();
    const networkNonce = 7;
    const provider = fakeProvider(() => networkNonce);
    // First attempt takes nonce 7, fails before broadcast, resets.
    expect(await mgr.current(provider, "0xabc")).toBe(7);
    mgr.reset();
    // Retry must reuse 7 (chain nonce never moved); the old take-then-advance
    // code handed out 8 here and poisoned every later relay.
    expect(await mgr.current(provider, "0xabc")).toBe(7);
    mgr.commit();
    expect(await mgr.current(provider, "0xabc")).toBe(8);
  });

  it("detects stale-nonce errors", () => {
    expect(isNonceError(new Error("nonce has already been used"))).toBe(true);
    expect(isNonceError(new Error("replacement transaction underpriced"))).toBe(true);
    expect(isNonceError(new Error("some unrelated failure"))).toBe(false);
  });
});

describe("relayFailureSummary", () => {
  it("keeps the revert selector and drops everything else", () => {
    const err = Object.assign(new Error("execution reverted (unknown custom error)"), {
      code: "CALL_EXCEPTION",
      // Selector + fake 32-byte arg: only the 4-byte selector may surface.
      data: `0xe2586bcc${"ab".repeat(32)}`,
      transaction: { data: `0xdeadbeef${"cd".repeat(64)}` },
    });
    expect(relayFailureSummary(err)).toEqual({
      code: "CALL_EXCEPTION",
      selector: "0xe2586bcc",
    });
  });

  it("never carries proof-shaped material", () => {
    const proofBlob = `0x${"12".repeat(256)}`;
    const err = Object.assign(new Error(`send failed ${proofBlob}`), {
      transaction: { proof: { nullifier: "123456789".repeat(9) } },
    });
    const summary = relayFailureSummary(err);
    expect(JSON.stringify(summary)).not.toContain("1212");
    expect(JSON.stringify(summary)).not.toContain("123456789");
  });

  it("returns empty for non-errors", () => {
    expect(relayFailureSummary(null)).toEqual({});
    expect(relayFailureSummary("boom")).toEqual({});
  });
});

describe("relay route logger privacy", () => {  it("redacts IPs, headers, and user agents", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const base = pino({ level: "info" }, stream);
    const relayLog = createRelayLogger(base);
    relayLog.info(
      {
        ip: "203.0.113.7",
        headers: { "user-agent": "test-agent", cookie: "secret" },
        electionId: "1",
        txHash: "0xabc",
      },
      "vote relayed",
    );
    const out = chunks.join("");
    expect(out).not.toContain("203.0.113.7");
    expect(out).not.toContain("test-agent");
    expect(out).not.toContain("secret");
    expect(out).toContain("0xabc");
    expect(RELAY_REDACT_PATHS.length).toBeGreaterThan(0);
  });
});
