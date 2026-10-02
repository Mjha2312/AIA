import type { Pool } from "pg";

export interface RegistrationStore {
  /** Returns true if inserted, false if (electionId, eligibilityHash) already exists. */
  insert(electionId: string, eligibilityHash: string): Promise<boolean>;
  exists(electionId: string, eligibilityHash: string): Promise<boolean>;
  /** Deletes a row (used to roll back after an on-chain failure so retry works). */
  remove(electionId: string, eligibilityHash: string): Promise<void>;
}

export class PgRegistrationStore implements RegistrationStore {
  constructor(private readonly pool: Pool) {}

  async insert(electionId: string, eligibilityHash: string): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO registrations (election_id, eligibility_hash)
       VALUES ($1, $2)
       ON CONFLICT (election_id, eligibility_hash) DO NOTHING`,
      [electionId, eligibilityHash],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async exists(electionId: string, eligibilityHash: string): Promise<boolean> {
    const res = await this.pool.query(
      "SELECT 1 FROM registrations WHERE election_id = $1 AND eligibility_hash = $2",
      [electionId, eligibilityHash],
    );
    return res.rowCount !== 0;
  }

  async remove(electionId: string, eligibilityHash: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM registrations WHERE election_id = $1 AND eligibility_hash = $2",
      [electionId, eligibilityHash],
    );
  }
}

/** In-memory store for tests / environments without Postgres. */
export class InMemoryRegistrationStore implements RegistrationStore {
  private readonly keys = new Set<string>();

  private key(electionId: string, eligibilityHash: string): string {
    return `${electionId}:${eligibilityHash}`;
  }

  async insert(electionId: string, eligibilityHash: string): Promise<boolean> {
    const k = this.key(electionId, eligibilityHash);
    if (this.keys.has(k)) return false;
    this.keys.add(k);
    return true;
  }

  async exists(electionId: string, eligibilityHash: string): Promise<boolean> {
    return this.keys.has(this.key(electionId, eligibilityHash));
  }

  async remove(electionId: string, eligibilityHash: string): Promise<void> {
    this.keys.delete(this.key(electionId, eligibilityHash));
  }
}
