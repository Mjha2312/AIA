import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildTestApp } from "./helpers.js";
import { seedReadModel } from "./fixtures.js";
import { computeVoteHash } from "../src/chain/relay.js";

describe("read endpoints", () => {
  it("GET /api/elections lists elections with SPEC fields", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const res = await request(app).get("/api/elections");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual({
      id: "1",
      constituencyId: "Ward 12",
      candidates: ["Alice", "Bob"],
      phase: 2,
    });
  });

  it("GET /api/elections/:id gates tally on phase >= Tallying", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);

    const voting = await request(app).get("/api/elections/1");
    expect(voting.status).toBe(200);
    expect(voting.body).toMatchObject({
      id: "1",
      constituencyId: "Ward 12",
      candidates: ["Alice", "Bob"],
      phase: 2,
      registeredCount: 4,
      votedCount: 3,
    });
    expect(voting.body).not.toHaveProperty("tally");

    const finalized = await request(app).get("/api/elections/2");
    expect(finalized.status).toBe(200);
    expect(finalized.body.tally).toEqual([0, 1]);
  });

  it("GET /api/elections/:id 404s unknown ids and 400s bad ids", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const missing = await request(app).get("/api/elections/99");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ELECTION_NOT_FOUND");
    const bad = await request(app).get("/api/elections/abc");
    expect(bad.status).toBe(400);
  });

  it("GET /api/elections/:id/turnout rounds to 2 decimals, zero-safe", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const res = await request(app).get("/api/elections/1/turnout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: 4, voted: 3, turnoutPct: 75 });
    const empty = await request(app).get("/api/elections/3/turnout");
    expect(empty.body).toEqual({ registered: 0, voted: 0, turnoutPct: 0 });
    const missing = await request(app).get("/api/elections/99/turnout");
    expect(missing.status).toBe(404);
  });

  it("GET /api/elections/:id/votes paginates stably with cursors", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);

    const page1 = await request(app).get("/api/elections/1/votes?limit=2");
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((v: { nullifier: string }) => v.nullifier)).toEqual(["5001", "5002"]);
    expect(page1.body.items[0]).toMatchObject({
      voteHash: computeVoteHash("1", "5001", "0"),
      candidateIndex: 0,
      txHash: "0xvote1",
      blockNumber: 10,
      timestamp: "2026-01-01T00:00:10.000Z",
    });
    expect(typeof page1.body.nextCursor).toBe("string");

    const page2 = await request(app).get(
      `/api/elections/1/votes?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );
    expect(page2.status).toBe(200);
    expect(page2.body.items.map((v: { nullifier: string }) => v.nullifier)).toEqual(["5003"]);
    expect(page2.body.nextCursor).toBeNull();

    // Full fetch in one page has no cursor.
    const all = await request(app).get("/api/elections/1/votes?limit=50");
    expect(all.body.items).toHaveLength(3);
    expect(all.body.nextCursor).toBeNull();
  });

  it("GET /api/elections/:id/votes rejects bad cursor and bad limit", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const badCursor = await request(app).get("/api/elections/1/votes?cursor=!!!not-a-cursor!!!");
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error.code).toBe("INVALID_CURSOR");
    const badLimit = await request(app).get("/api/elections/1/votes?limit=500");
    expect(badLimit.status).toBe(400);
    const missing = await request(app).get("/api/elections/99/votes");
    expect(missing.status).toBe(404);
  });

  it("GET /api/elections/:id/group returns commitments in leaf order", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const res = await request(app).get("/api/elections/1/group");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ members: ["1001", "1002", "1003", "1004"] });
    const missing = await request(app).get("/api/elections/99/group");
    expect(missing.status).toBe(404);
  });

  it("GET /api/receipts/:nullifier finds votes and reports misses", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const found = await request(app).get("/api/receipts/5002");
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({
      found: true,
      voteHash: computeVoteHash("1", "5002", "0"),
      txHash: "0xvote2",
      blockNumber: 11,
    });
    const miss = await request(app).get("/api/receipts/9999");
    expect(miss.status).toBe(200);
    expect(miss.body).toEqual({ found: false });
    const bad = await request(app).get("/api/receipts/xyz");
    expect(bad.status).toBe(400);
  });

  it("GET /api/docs/ serves Swagger UI", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger/i);
  });

  it("GET /mock-kyc renders the form; disabled without MOCK_KYC", async () => {
    const { app } = buildTestApp();
    const page = await request(app).get("/mock-kyc?sessionId=abc-123");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toMatch(/html/);
    expect(page.text).toContain("abc-123");
    expect(page.text).toContain("/api/kyc/complete");

    const missing = await request(app).get("/mock-kyc");
    expect(missing.status).toBe(400);

    const { app: noMock } = buildTestApp({ mockKyc: false });
    const disabled = await request(noMock).get("/mock-kyc?sessionId=abc-123");
    expect(disabled.status).toBe(404);
  });
});
