import type { Pool } from "pg";
import type { ElectionDetailsInput, GroupMemberRow, VoteRow } from "./types.js";

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
}
