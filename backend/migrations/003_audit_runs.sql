-- 003: audit runs for the EVM shadow-audit endpoint.
-- Each POST /api/elections/:id/audit persists its inputs and verdict here
-- so past audits are reviewable via GET /api/elections/:id/audits.

CREATE TABLE IF NOT EXISTS audit_runs (
  id SERIAL PRIMARY KEY,
  election_id TEXT NOT NULL,
  evm_tally JSONB NOT NULL,
  chain_tally JSONB NOT NULL,
  match BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_runs_election_idx ON audit_runs (election_id, id);
