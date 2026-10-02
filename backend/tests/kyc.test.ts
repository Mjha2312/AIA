import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildTestApp, TEST_JWT_SECRET } from "./helpers.js";

describe("KYC endpoints", () => {
  it("GET /api/health returns ok", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("happy path: start -> complete returns a 10-minute JWT", async () => {
    const { app } = buildTestApp();
    const start = await request(app).post("/api/kyc/start").send({ electionId: "1" });
    expect(start.status).toBe(200);
    expect(start.body.sessionId).toBeTypeOf("string");
    expect(start.body.redirectUrl).toContain(start.body.sessionId);

    const complete = await request(app)
      .post("/api/kyc/complete")
      .send({ sessionId: start.body.sessionId, mockEpic: "WB/12/345/678901" });
    expect(complete.status).toBe(200);
    expect(complete.body.kycToken).toBeTypeOf("string");

    const decoded = jwt.verify(complete.body.kycToken, TEST_JWT_SECRET) as Record<string, unknown>;
    expect(decoded.electionId).toBe("1");
    expect(decoded.type).toBe("kyc");
    expect(decoded.subjectId).toBeTypeOf("string");
    const ttl = (decoded.exp as number) - (decoded.iat as number);
    expect(ttl).toBeLessThanOrEqual(600);
    expect(ttl).toBeGreaterThan(590);
  });

  it("rejects invalid EPIC format with INVALID_EPIC", async () => {
    const { app } = buildTestApp();
    const start = await request(app).post("/api/kyc/start").send({ electionId: "1" });
    const bad = ["not-an-epic", "wb/12/345/678901", "WB-12-345-678901", "", "WB/1/34/5678901"];
    for (const mockEpic of bad) {
      const res = await request(app).post("/api/kyc/complete").send({
        sessionId: start.body.sessionId,
        mockEpic,
      });
      // First bad attempt consumes nothing (session stays valid for retry),
      // but every bad format must be a 400 INVALID_EPIC. Re-start per attempt
      // because a later valid-format test is not part of this loop.
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_EPIC");
    }
  });

  it("rejects unknown session with UNKNOWN_SESSION", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/api/kyc/complete")
      .send({ sessionId: "00000000-0000-0000-0000-000000000000", mockEpic: "WB/12/345/678901" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("UNKNOWN_SESSION");
  });

  it("rejects invalid electionId on start", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/kyc/start").send({ electionId: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });
});
