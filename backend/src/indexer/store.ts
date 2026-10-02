import type { Pool } from "pg";
import type {
  AuditRun,
  ElectionDetailsInput,
  ElectionRecord,
  GroupMemberRow,
  TableCounts,
  VotesCursor,
  VoteRow,
} from "./types.js";

export interface IndexerStore {
  getLastProcessedBlock(): Promise<number | null>;
  setLastProcessedBlock(blockNumber: number): Promise<void>;
  /** Insert on ElectionCreated; no-op if the election row already exists. */
  ensureElection(electionId: string, constituencyId: string): Promise<void>;
  setElectionDetails(electionId: string, details: ElectionDetailsInput): Promise<void>;
  setPhase(electionId: string, phase: number): Promise<void>;
  bumpRegistered(electionId: string): Promise<void>;
  bumpVoted(electionId: string): Promise<void>;
  /** Idempotent on (txHash, logIndex). Returns true if newly inserted. */
  addVote(vote: VoteRow): Promise<boolean>;
  /** Idempotent on (electionId, identityCommitment). */
  addMember(member: GroupMemberRow): Promise<{ inserted: boolean; leafIndex: number }>;
  /** Idempotent on (txHash, logIndex). Returns true if newly inserted. */
  addPhaseChange(electionId: string, newPhase: number, txHash: string, logIndex: number, blockNumber: number): Promise<boolean>;
  memberCount(electionId: string): Promise<number>;
  // ---- read model (public API) ----
  listElections(): Promise<ElectionRecord[]>;
  getElectionRecord(electionId: string): Promise<ElectionRecord | null>;
  /** Votes ordered by (blockNumber, logIndex); pass limit+1 rows to detect more. */
  listVotes(electionId: string, after: VotesCursor | null, limit: number): Promise<VoteRow[]>;
  /** Identity commitments ordered by leaf_index (for client-side Merkle tree). */
  listMembers(electionId: string): Promise<string[]>;
  findVoteByNullifier(nullifier: string): Promise<VoteRow | null>;
  /** Per-candidate counts from the votes table, padded to candidates.length. */
  getTally(electionId: string): Promise<number[] | null>;
  recordAuditRun(electionId: string, evmTally: number[], chainTally: number[], match: boolean): Promise<AuditRun>;
  listAuditRuns(electionId: string): Promise<AuditRun[]>;
  getCounts(): Promise<TableCounts>;
}

const LAST_BLOCK_KEY = "last_processed_block";

export class PgIndexerStore implements IndexerStore {
  constructor(private readonly pool: Pool) {}

  async getLastProcessedBlock(): Promise<number | null> {
    const res = await this.pool.query("SELECT value FROM indexer_state WHERE key = $1", [LAST_BLOCK_KEY]);
    if (res.rowCount === 0) return null;
    return Number((res.rows[0] as { value: string }).value);
  }

  async setLastProcessedBlock(blockNumber: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO indexer_state (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [LAST_BLOCK_KEY, String(blockNumber)],
    );
  }

  async ensureElection(electionId: string, constituencyId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO elections (election_id, constituency_id) VALUES ($1, $2)
       ON CONFLICT (election_id) DO NOTHING`,
      [electionId, constituencyId],
    );
  }

  async setElectionDetails(electionId: string, details: ElectionDetailsInput): Promise<void> {
    await this.pool.query(
      `UPDATE elections SET constituency_id = $2, candidates = $3, updated_at = now()
       WHERE election_id = $1`,
      [electionId, details.constituencyId, JSON.stringify(details.candidates)],
    );
  }

  async setPhase(electionId: string, phase: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO elections (election_id, phase) VALUES ($1, $2)
       ON CONFLICT (election_id) DO UPDATE SET phase = EXCLUDED.phase, updated_at = now()`,
      [electionId, phase],
    );
  }

  async bumpRegistered(electionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE elections SET registered_count = registered_count + 1, updated_at = now()
       WHERE election_id = $1`,
      [electionId],
    );
  }

  async bumpVoted(electionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE elections SET voted_count = voted_count + 1, updated_at = now()
       WHERE election_id = $1`,
      [electionId],
    );
  }

  async addVote(vote: VoteRow): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO votes (vote_hash, election_id, nullifier, candidate_index, tx_hash, log_index, block_number, block_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        vote.voteHash,
        vote.electionId,
        vote.nullifier,
        vote.candidateIndex,
        vote.txHash,
        vote.logIndex,
        vote.blockNumber,
        vote.blockTimestamp,
      ],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async addMember(member: GroupMemberRow): Promise<{ inserted: boolean; leafIndex: number }> {
    const res = await this.pool.query(
      `INSERT INTO group_members (election_id, identity_commitment, leaf_index, tx_hash, log_index, block_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING leaf_index`,
      [
        member.electionId,
        member.identityCommitment,
        member.leafIndex,
        member.txHash,
        member.logIndex,
        member.blockNumber,
      ],
    );
    if ((res.rowCount ?? 0) > 0) {
      return { inserted: true, leafIndex: member.leafIndex };
    }
    const existing = await this.pool.query(
      "SELECT leaf_index FROM group_members WHERE election_id = $1 AND identity_commitment = $2",
      [member.electionId, member.identityCommitment],
    );
    return { inserted: false, leafIndex: Number((existing.rows[0] as { leaf_index: string }).leaf_index) };
  }

  async addPhaseChange(
    electionId: string,
    newPhase: number,
    txHash: string,
    logIndex: number,
    blockNumber: number,
  ): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO phase_changes (election_id, new_phase, tx_hash, log_index, block_number)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [electionId, newPhase, txHash, logIndex, blockNumber],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async memberCount(electionId: string): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*) AS n FROM group_members WHERE election_id = $1", [
      electionId,
    ]);
    return Number((res.rows[0] as { n: string }).n);
  }

  private static toRecord(row: {
    election_id: string;
    constituency_id: string;
    candidates: unknown;
    phase: number;
    registered_count: string;
    voted_count: string;
  }): ElectionRecord {
    return {
      electionId: row.election_id,
      constituencyId: row.constituency_id,
      candidates: Array.isArray(row.candidates) ? (row.candidates as string[]) : [],
      phase: Number(row.phase),
      registered: Number(row.registered_count),
      voted: Number(row.voted_count),
    };
  }

  async listElections(): Promise<ElectionRecord[]> {
    const res = await this.pool.query(
      `SELECT election_id, constituency_id, candidates, phase, registered_count, voted_count
       FROM elections ORDER BY election_id ASC`,
    );
    return res.rows.map((r) =>
      PgIndexerStore.toRecord(
        r as {
          election_id: string;
          constituency_id: string;
          candidates: unknown;
          phase: number;
          registered_count: string;
          voted_count: string;
        },
      ),
    );
  }

  async getElectionRecord(electionId: string): Promise<ElectionRecord | null> {
    const res = await this.pool.query(
      `SELECT election_id, constituency_id, candidates, phase, registered_count, voted_count
       FROM elections WHERE election_id = $1`,
      [electionId],
    );
    if (res.rowCount === 0) return null;
    return PgIndexerStore.toRecord(
      res.rows[0] as {
        election_id: string;
        constituency_id: string;
        candidates: unknown;
        phase: number;
        registered_count: string;
        voted_count: string;
      },
    );
  }

  private static toVoteRow(row: {
    vote_hash: string;
    election_id: string;
    nullifier: string;
    candidate_index: number;
    tx_hash: string;
    log_index: number;
    block_number: string;
    block_timestamp: Date | null;
  }): VoteRow {
    return {
      voteHash: row.vote_hash,
      electionId: row.election_id,
      nullifier: row.nullifier,
      candidateIndex: Number(row.candidate_index),
      txHash: row.tx_hash,
      logIndex: Number(row.log_index),
      blockNumber: Number(row.block_number),
      blockTimestamp: row.block_timestamp,
    };
  }

  async listVotes(electionId: string, after: VotesCursor | null, limit: number): Promise<VoteRow[]> {
    const res = await this.pool.query(
      `SELECT vote_hash, election_id, nullifier, candidate_index, tx_hash, log_index, block_number, block_timestamp
       FROM votes
       WHERE election_id = $1
         AND ($2::bigint IS NULL OR (block_number, log_index) > ($2::bigint, $3::integer))
       ORDER BY block_number ASC, log_index ASC
       LIMIT $4`,
      [electionId, after?.blockNumber ?? null, after?.logIndex ?? null, limit],
    );
    return res.rows.map((r) =>
      PgIndexerStore.toVoteRow(
        r as {
          vote_hash: string;
          election_id: string;
          nullifier: string;
          candidate_index: number;
          tx_hash: string;
          log_index: number;
          block_number: string;
          block_timestamp: Date | null;
        },
      ),
    );
  }

  async listMembers(electionId: string): Promise<string[]> {
    const res = await this.pool.query(
      "SELECT identity_commitment FROM group_members WHERE election_id = $1 ORDER BY leaf_index ASC",
      [electionId],
    );
    return res.rows.map((r) => (r as { identity_commitment: string }).identity_commitment);
  }

  async findVoteByNullifier(nullifier: string): Promise<VoteRow | null> {
    const res = await this.pool.query(
      `SELECT vote_hash, election_id, nullifier, candidate_index, tx_hash, log_index, block_number, block_timestamp
       FROM votes WHERE nullifier = $1 ORDER BY block_number ASC, log_index ASC LIMIT 1`,
      [nullifier],
    );
    if (res.rowCount === 0) return null;
    return PgIndexerStore.toVoteRow(
      res.rows[0] as {
        vote_hash: string;
        election_id: string;
        nullifier: string;
        candidate_index: number;
        tx_hash: string;
        log_index: number;
        block_number: string;
        block_timestamp: Date | null;
      },
    );
  }

  async getTally(electionId: string): Promise<number[] | null> {
    const record = await this.getElectionRecord(electionId);
    if (!record) return null;
    const tally = new Array<number>(record.candidates.length).fill(0);
    const res = await this.pool.query(
      "SELECT candidate_index, COUNT(*) AS n FROM votes WHERE election_id = $1 GROUP BY candidate_index",
      [electionId],
    );
    for (const r of res.rows as Array<{ candidate_index: number; n: string }>) {
      const idx = Number(r.candidate_index);
      if (idx >= 0 && idx < tally.length) tally[idx] = Number(r.n);
    }
    return tally;
  }

  async recordAuditRun(
    electionId: string,
    evmTally: number[],
    chainTally: number[],
    match: boolean,
  ): Promise<AuditRun> {
    const res = await this.pool.query(
      `INSERT INTO audit_runs (election_id, evm_tally, chain_tally, match)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [electionId, JSON.stringify(evmTally), JSON.stringify(chainTally), match],
    );
    const row = res.rows[0] as { id: number; created_at: Date };
    return {
      id: Number(row.id),
      electionId,
      evmTally: [...evmTally],
      chainTally: [...chainTally],
      match,
      createdAt: row.created_at,
    };
  }

  async listAuditRuns(electionId: string): Promise<AuditRun[]> {
    const res = await this.pool.query(
      `SELECT id, election_id, evm_tally, chain_tally, match, created_at
       FROM audit_runs WHERE election_id = $1 ORDER BY id ASC`,
      [electionId],
    );
    return (res.rows as Array<{ id: number; election_id: string; evm_tally: number[]; chain_tally: number[]; match: boolean; created_at: Date }>).map(
      (r) => ({
        id: Number(r.id),
        electionId: r.election_id,
        evmTally: r.evm_tally,
        chainTally: r.chain_tally,
        match: r.match,
        createdAt: r.created_at,
      }),
    );
  }

  async getCounts(): Promise<TableCounts> {
    const res = await this.pool.query(
      `SELECT (SELECT COUNT(*) FROM elections) AS elections,
              (SELECT COUNT(*) FROM votes) AS votes,
              (SELECT COUNT(*) FROM group_members) AS members,
              (SELECT COUNT(*) FROM phase_changes) AS phase_changes,
              (SELECT COUNT(*) FROM audit_runs) AS audits`,
    );
    const row = res.rows[0] as Record<string, string>;
    return {
      elections: Number(row.elections),
      votes: Number(row.votes),
      members: Number(row.members),
      phaseChanges: Number(row.phase_changes),
      audits: Number(row.audits),
    };
  }
}

/** In-memory store for tests / environments without Postgres. */
export class InMemoryIndexerStore implements IndexerStore {
  private lastBlock: number | null = null;
  private elections = new Map<string, { constituencyId: string; candidates: string[]; phase: number; registered: number; voted: number }>();
  private votes = new Map<string, VoteRow>();
  private voteLogKeys = new Set<string>();
  private voteNullifiers = new Set<string>();
  private members = new Map<string, GroupMemberRow>();
  private phaseChanges = new Set<string>();
  private audits: AuditRun[] = [];
  private nextAuditId = 1;

  async getLastProcessedBlock(): Promise<number | null> {
    return this.lastBlock;
  }

  async setLastProcessedBlock(blockNumber: number): Promise<void> {
    this.lastBlock = this.lastBlock === null ? blockNumber : Math.max(this.lastBlock, blockNumber);
  }

  async ensureElection(electionId: string, constituencyId: string): Promise<void> {
    if (!this.elections.has(electionId)) {
      this.elections.set(electionId, { constituencyId, candidates: [], phase: 0, registered: 0, voted: 0 });
    }
  }

  async setElectionDetails(electionId: string, details: ElectionDetailsInput): Promise<void> {
    const e = this.elections.get(electionId);
    if (e) {
      e.constituencyId = details.constituencyId;
      e.candidates = [...details.candidates];
    }
  }

  async setPhase(electionId: string, phase: number): Promise<void> {
    await this.ensureElection(electionId, "");
    const e = this.elections.get(electionId);
    if (e) e.phase = phase;
  }

  async bumpRegistered(electionId: string): Promise<void> {
    const e = this.elections.get(electionId);
    if (e) e.registered += 1;
  }

  async bumpVoted(electionId: string): Promise<void> {
    const e = this.elections.get(electionId);
    if (e) e.voted += 1;
  }

  async addVote(vote: VoteRow): Promise<boolean> {
    const logKey = `${vote.txHash}:${vote.logIndex}`;
    const nullKey = `${vote.electionId}:${vote.nullifier}`;
    if (this.votes.has(vote.voteHash) || this.voteLogKeys.has(logKey) || this.voteNullifiers.has(nullKey)) {
      return false;
    }
    this.votes.set(vote.voteHash, vote);
    this.voteLogKeys.add(logKey);
    this.voteNullifiers.add(nullKey);
    return true;
  }

  async addMember(member: GroupMemberRow): Promise<{ inserted: boolean; leafIndex: number }> {
    const key = `${member.electionId}:${member.identityCommitment}`;
    const existing = this.members.get(key);
    if (existing) return { inserted: false, leafIndex: existing.leafIndex };
    this.members.set(key, member);
    return { inserted: true, leafIndex: member.leafIndex };
  }

  async addPhaseChange(
    electionId: string,
    newPhase: number,
    txHash: string,
    logIndex: number,
    _blockNumber: number,
  ): Promise<boolean> {
    void electionId;
    void newPhase;
    const key = `${txHash}:${logIndex}`;
    if (this.phaseChanges.has(key)) return false;
    this.phaseChanges.add(key);
    return true;
  }

  async memberCount(electionId: string): Promise<number> {
    let n = 0;
    for (const key of this.members.keys()) {
      if (key.startsWith(`${electionId}:`)) n++;
    }
    return n;
  }

  // Test introspection helpers (not part of the interface).
  get voteCount(): number {
    return this.votes.size;
  }

  getElection(electionId: string): { phase: number; registered: number; voted: number } | undefined {
    return this.elections.get(electionId);
  }

  async listElections(): Promise<ElectionRecord[]> {
    return [...this.elections.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([electionId, e]) => ({
        electionId,
        constituencyId: e.constituencyId,
        candidates: [...e.candidates],
        phase: e.phase,
        registered: e.registered,
        voted: e.voted,
      }));
  }

  async getElectionRecord(electionId: string): Promise<ElectionRecord | null> {
    const e = this.elections.get(electionId);
    if (!e) return null;
    return {
      electionId,
      constituencyId: e.constituencyId,
      candidates: [...e.candidates],
      phase: e.phase,
      registered: e.registered,
      voted: e.voted,
    };
  }

  async listVotes(electionId: string, after: VotesCursor | null, limit: number): Promise<VoteRow[]> {
    return [...this.votes.values()]
      .filter((v) => v.electionId === electionId)
      .filter(
        (v) =>
          after === null ||
          v.blockNumber > after.blockNumber ||
          (v.blockNumber === after.blockNumber && v.logIndex > after.logIndex),
      )
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .slice(0, limit);
  }

  async listMembers(electionId: string): Promise<string[]> {
    return [...this.members.values()]
      .filter((m) => m.electionId === electionId)
      .sort((a, b) => a.leafIndex - b.leafIndex)
      .map((m) => m.identityCommitment);
  }

  async findVoteByNullifier(nullifier: string): Promise<VoteRow | null> {
    const found = [...this.votes.values()]
      .filter((v) => v.nullifier === nullifier)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    return found[0] ?? null;
  }

  async getTally(electionId: string): Promise<number[] | null> {
    const record = await this.getElectionRecord(electionId);
    if (!record) return null;
    const tally = new Array<number>(record.candidates.length).fill(0);
    for (const v of this.votes.values()) {
      if (v.electionId === electionId && v.candidateIndex >= 0 && v.candidateIndex < tally.length) {
        tally[v.candidateIndex] += 1;
      }
    }
    return tally;
  }

  async recordAuditRun(
    electionId: string,
    evmTally: number[],
    chainTally: number[],
    match: boolean,
  ): Promise<AuditRun> {
    const run: AuditRun = {
      id: this.nextAuditId++,
      electionId,
      evmTally: [...evmTally],
      chainTally: [...chainTally],
      match,
      createdAt: new Date(),
    };
    this.audits.push(run);
    return { ...run };
  }

  async listAuditRuns(electionId: string): Promise<AuditRun[]> {
    return this.audits
      .filter((a) => a.electionId === electionId)
      .map((a) => ({ ...a, evmTally: [...a.evmTally], chainTally: [...a.chainTally] }));
  }

  async getCounts(): Promise<TableCounts> {
    return {
      elections: this.elections.size,
      votes: this.votes.size,
      members: this.members.size,
      phaseChanges: this.phaseChanges.size,
      audits: this.audits.length,
    };
  }
}
