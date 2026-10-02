import type { Express } from "express";
import { sendError, zodErrorMessage } from "../errors.js";
import { electionIdSchema, uint256StringSchema, votesQuerySchema } from "../schemas.js";
import type { IndexerStore } from "../indexer/store.js";
import type { VotesCursor } from "../indexer/types.js";

/** Phase at which the tally becomes public (Tallying=3, Finalized=4). */
export const TALLYING_PHASE = 3;

export interface ReadRouteDeps {
  indexerStore: IndexerStore;
}

/** Opaque pagination cursor over votes ordered by (blockNumber, logIndex). */
export function encodeVotesCursor(cursor: VotesCursor): string {
  return Buffer.from(JSON.stringify({ b: cursor.blockNumber, l: cursor.logIndex }), "utf8").toString(
    "base64url",
  );
}

export function decodeVotesCursor(raw: string): VotesCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { b, l } = parsed as { b?: unknown; l?: unknown };
    if (
      typeof b !== "number" ||
      typeof l !== "number" ||
      !Number.isInteger(b) ||
      !Number.isInteger(l) ||
      b < 0 ||
      l < 0
    ) {
      return null;
    }
    return { blockNumber: b, logIndex: l };
  } catch {
    return null;
  }
}

function electionIdParam(raw: string): string | null {
  return electionIdSchema.safeParse(raw).success ? raw : null;
}

export function registerReadRoutes(app: Express, deps: ReadRouteDeps): void {
  const { indexerStore } = deps;

  // GET /api/elections -> Election[]
  app.get("/api/elections", async (_req, res) => {
    const records = await indexerStore.listElections();
    res.json(
      records.map((r) => ({
        id: r.electionId,
        constituencyId: r.constituencyId,
        candidates: r.candidates,
        phase: r.phase,
      })),
    );
  });

  // GET /api/elections/:id -> Election (+ tally if phase >= Tallying)
  app.get("/api/elections/:id", async (req, res) => {
    const id = electionIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const record = await indexerStore.getElectionRecord(id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    const body: Record<string, unknown> = {
      id: record.electionId,
      constituencyId: record.constituencyId,
      candidates: record.candidates,
      phase: record.phase,
      registeredCount: record.registered,
      votedCount: record.voted,
    };
    if (record.phase >= TALLYING_PHASE) {
      body.tally = (await indexerStore.getTally(id)) ?? [];
    }
    res.json(body);
  });

  // GET /api/elections/:id/turnout -> { registered, voted, turnoutPct }
  app.get("/api/elections/:id/turnout", async (req, res) => {
    const id = electionIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const record = await indexerStore.getElectionRecord(id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    const turnoutPct =
      record.registered === 0 ? 0 : Math.round((record.voted / record.registered) * 10000) / 100;
    res.json({ registered: record.registered, voted: record.voted, turnoutPct });
  });

  // GET /api/elections/:id/votes?cursor=&limit= -> { items, nextCursor }
  app.get("/api/elections/:id/votes", async (req, res) => {
    const id = electionIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const query = votesQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(query.error));
      return;
    }
    const record = await indexerStore.getElectionRecord(id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    let after: VotesCursor | null = null;
    if (query.data.cursor !== undefined) {
      after = decodeVotesCursor(query.data.cursor);
      if (!after) {
        sendError(res, 400, "INVALID_CURSOR", "cursor is malformed");
        return;
      }
    }
    const rows = await indexerStore.listVotes(id, after, query.data.limit + 1);
    const page = rows.slice(0, query.data.limit);
    const nextCursor =
      rows.length > query.data.limit
        ? encodeVotesCursor({
            blockNumber: page[page.length - 1].blockNumber,
            logIndex: page[page.length - 1].logIndex,
          })
        : null;
    res.json({
      items: page.map((v) => ({
        voteHash: v.voteHash,
        nullifier: v.nullifier,
        candidateIndex: v.candidateIndex,
        txHash: v.txHash,
        blockNumber: v.blockNumber,
        timestamp: v.blockTimestamp ? v.blockTimestamp.toISOString() : null,
      })),
      nextCursor,
    });
  });

  // GET /api/elections/:id/group -> { members } (leaf_index order)
  app.get("/api/elections/:id/group", async (req, res) => {
    const id = electionIdParam(req.params.id);
    if (id === null) {
      sendError(res, 400, "INVALID_REQUEST", "id: electionId must be a decimal string (uint256)");
      return;
    }
    const record = await indexerStore.getElectionRecord(id);
    if (!record) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    res.json({ members: await indexerStore.listMembers(id) });
  });

  // GET /api/receipts/:nullifier -> { found, voteHash?, ... }
  app.get("/api/receipts/:nullifier", async (req, res) => {
    if (!uint256StringSchema.safeParse(req.params.nullifier).success) {
      sendError(res, 400, "INVALID_REQUEST", "nullifier: must be a decimal string (uint256)");
      return;
    }
    const vote = await indexerStore.findVoteByNullifier(req.params.nullifier);
    if (!vote) {
      res.json({ found: false });
      return;
    }
    res.json({
      found: true,
      voteHash: vote.voteHash,
      txHash: vote.txHash,
      blockNumber: vote.blockNumber,
      timestamp: vote.blockTimestamp ? vote.blockTimestamp.toISOString() : null,
    });
  });
}
