import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildTestApp, TEST_ADMIN_KEY } from "./helpers.js";
import { seedReadModel } from "./fixtures.js";

const ADMIN = { "x-admin-key": TEST_ADMIN_KEY };

describe("audit endpoints", () => {
  it("rejects missing/wrong admin key; 503 when unconfigured", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);
    const body = { booths: [{ boothId: "b1", counts: [2, 1] }] };

    const none = await request(app).post("/api/elections/1/audit").send(body);
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("INVALID_ADMIN_KEY");

    const wrong = await request(app)
      .post("/api/elections/1/audit")
      .set("x-admin-key", "nope")
      .send(body);
    expect(wrong.status).toBe(401);

    const { app: unconfigured } = buildTestApp({ adminApiKey: "" });
    const off = await request(unconfigured)
      .post("/api/elections/1/audit")
      .set(ADMIN)
      .send(body);
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe("AUDIT_DISABLED");
  });

  it("reports match when booth sums equal the chain tally, and persists the run", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore); // chain tally for "1" is [2,1]

    const res = await request(app)
      .post("/api/elections/1/audit")
      .set(ADMIN)
      .send({ booths: [{ boothId: "b1", counts: [2, 0] }, { boothId: "b2", counts: [0, 1] }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ match: true, chainTally: [2, 1], evmTally: [2, 1], diff: [0, 0] });

    const runs = await request(app).get("/api/elections/1/audits");
    expect(runs.status).toBe(200);
    expect(runs.body.audits).toHaveLength(1);
    expect(runs.body.audits[0]).toMatchObject({
      electionId: "1",
      evmTally: [2, 1],
      chainTally: [2, 1],
      match: true,
    });
    expect(typeof runs.body.audits[0].id).toBe("number");
  });

  it("reports mismatch with per-candidate diff", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);

    const res = await request(app)
      .post("/api/elections/1/audit")
      .set(ADMIN)
      .send({ booths: [{ boothId: "b1", counts: [1, 1] }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ match: false, chainTally: [2, 1], evmTally: [1, 1], diff: [1, 0] });

    const runs = await request(app).get("/api/elections/1/audits");
    expect(runs.body.audits).toHaveLength(1);
    expect(runs.body.audits[0].match).toBe(false);
  });

  it("rejects booth shapes that do not match the candidate list", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);

    const res = await request(app)
      .post("/api/elections/1/audit")
      .set(ADMIN)
      .send({ booths: [{ boothId: "b1", counts: [1, 1, 1] }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AUDIT_SHAPE_MISMATCH");

    const runs = await request(app).get("/api/elections/1/audits");
    expect(runs.body.audits).toHaveLength(0);
  });

  it("validates body strictly and 404s unknown elections", async () => {
    const { app, ctx } = buildTestApp();
    await seedReadModel(ctx.indexerStore);

    const empty = await request(app).post("/api/elections/1/audit").set(ADMIN).send({ booths: [] });
    expect(empty.status).toBe(400);

    const negative = await request(app)
      .post("/api/elections/1/audit")
      .set(ADMIN)
      .send({ booths: [{ boothId: "b1", counts: [1, -1] }] });
    expect(negative.status).toBe(400);

    const missing = await request(app)
      .post("/api/elections/99/audit")
      .set(ADMIN)
      .send({ booths: [{ boothId: "b1", counts: [0, 0] }] });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ELECTION_NOT_FOUND");

    const missingList = await request(app).get("/api/elections/99/audits");
    expect(missingList.status).toBe(404);
  });
});
