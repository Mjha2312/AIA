import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHash } from "node:crypto";
import { buildTestApp, getKycToken, mintToken, TEST_SERVER_SECRET } from "./helpers.js";
import { computeEligibilityHash } from "../src/privacy.js";

const COMMITMENT_A = "1234567890123456789012345678901234567890";
const COMMITMENT_B = "9876543210987654321098765432109876543210";

describe("POST /api/register", () => {
  it("happy path: verifies token, stores eligibility hash only, returns txHash", async () => {
    const { app, ctx } = buildTestApp();
    const kycToken = await getKycToken(app, "1");

    const res = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(res.status).toBe(200);
    expect(res.body.txHash).toBeTypeOf("string");

    // The eligibility hash for this voter+election is now stored…
    const subjectId = createHash("sha256").update("WB/12/345/678901").digest("hex");
    const hash = computeEligibilityHash(TEST_SERVER_SECRET, subjectId, "1");
    expect(await ctx.store.exists("1", hash)).toBe(true);
    // …and the chain registrar was called with the commitment.
    expect(ctx.registrar.calls).toEqual([{ electionId: "1", identityCommitment: COMMITMENT_A }]);
  });

  it("duplicate registration returns 409 ALREADY_REGISTERED", async () => {
    const { app } = buildTestApp();
    const kycToken = await getKycToken(app, "1");

    const first = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(first.status).toBe(200);

    // Same person (same token), different commitment — still a conflict:
    // uniqueness is per person per election, not per commitment.
    const second = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_B });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("expired token returns 401 TOKEN_EXPIRED", async () => {
    const { app } = buildTestApp();
    const kycToken = mintToken("somesubject", "1", { expired: true });
    const res = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("tampered token returns 401 INVALID_TOKEN", async () => {
    const { app } = buildTestApp();
    const kycToken = await getKycToken(app, "1");
    const tampered = kycToken.slice(0, -1) + (kycToken.endsWith("a") ? "b" : "a");
    const res = await request(app)
      .post("/api/register")
      .send({ kycToken: tampered, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("token for another election returns 403 ELECTION_MISMATCH", async () => {
    const { app } = buildTestApp();
    const kycToken = mintToken("somesubject", "2");
    const res = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ELECTION_MISMATCH");
  });

  it("chain failure rolls back the DB insert so the voter can retry", async () => {
    const { app, ctx } = buildTestApp();
    const kycToken = await getKycToken(app, "1");

    ctx.registrar.failNextWith = new Error("simulated chain outage");
    const failed = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("CHAIN_ERROR");

    // Rollback verified: the same voter can retry and succeed.
    const retry = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(retry.status).toBe(200);
    expect(retry.body.txHash).toBeTypeOf("string");
  });

  it("wrong-secret token returns 401 INVALID_TOKEN", async () => {
    const { app } = buildTestApp();
    const kycToken = mintToken("somesubject", "1", { secret: "wrong-secret" });
    const res = await request(app)
      .post("/api/register")
      .send({ kycToken, electionId: "1", identityCommitment: COMMITMENT_A });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
