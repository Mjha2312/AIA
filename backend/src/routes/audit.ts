import { timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { sendError, zodErrorMessage } from "../errors.js";
import { auditSchema, electionIdSchema } from "../schemas.js";
import type { IndexerStore } from "../indexer/store.js";

export interface AuditRouteDeps {
  indexerStore: IndexerStore;
  /** Prototype gate: expected value of the x-admin-key header ("" = disabled). */
  adminApiKey: string;
}

/**
 * Constant-time admin key comparison (length-guarded).
 * Prototype only: production must use ECI-signed audit submissions.
 */
export function isValidAdminKey(provided: string | undefined, expected: string): boolean {
  if (!expected || provided === undefined) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function registerAuditRoutes(app: Express, deps: AuditRouteDeps): void {
  const { indexerStore, adminApiKey } = deps;

  const requireAdminKey = (header: unknown): boolean => {
    if (!adminApiKey) return false;
    return typeof header === "string" && isValidAdminKey(header, adminApiKey);
  };

  // POST /api/elections/:id/audit { booths: [{ boothId, counts }] }
  // -> { match, chainTally, evmTally, diff }
  app.post("/api/elections/:id/audit", async (req, res) => {
    if (!requireAdminKey(req.headers["x-admin-key"])) {
      if (!adminApiKey) {
        sendError(res, 503, "AUDIT_DISABLED", "Audit endpoint is not configured (ADMIN_API_KEY unset)");
      } else {
        sendError(res, 401, "INVALID_ADMIN_KEY", "Valid x-admin-key header required");
      }
      return;
    }
    if (!electionIdSchema.safeParse(req.params.id).success) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const parsed = auditSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(parsed.error));
      return;
    }
    const record = await indexerStore.getElectionRecord(req.params.id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    const width = record.candidates.length;
    for (const booth of parsed.data.booths) {
      if (booth.counts.length !== width) {
        sendError(
          res,
          400,
          "AUDIT_SHAPE_MISMATCH",
          `booth "${booth.boothId}" has ${booth.counts.length} counts but the election has ${width} candidates`,
        );
        return;
      }
    }
    const chainTally = (await indexerStore.getTally(req.params.id)) ?? new Array<number>(width).fill(0);
    const evmTally = new Array<number>(width).fill(0);
    for (const booth of parsed.data.booths) {
      booth.counts.forEach((c, i) => {
        evmTally[i] += c;
      });
    }
    const diff = chainTally.map((c, i) => c - evmTally[i]);
    const match = diff.every((d) => d === 0);
    await indexerStore.recordAuditRun(req.params.id, evmTally, chainTally, match);
    res.json({ match, chainTally, evmTally, diff });
  });

  // GET /api/elections/:id/audits -> past audit runs for the election.
  app.get("/api/elections/:id/audits", async (req, res) => {
    if (!electionIdSchema.safeParse(req.params.id).success) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const record = await indexerStore.getElectionRecord(req.params.id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    const runs = await indexerStore.listAuditRuns(req.params.id);
    res.json({
      audits: runs.map((r) => ({
        id: r.id,
        electionId: r.electionId,
        evmTally: r.evmTally,
        chainTally: r.chainTally,
        match: r.match,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      })),
    });
  });
}
