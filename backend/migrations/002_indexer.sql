-- 002: indexer tables for chain events (see docs/SPEC.md).
-- All writes are idempotent on (tx_hash, log_index) so backfills and
-- reconnect replays never duplicate rows. Only chain-public data is stored.

CREATE TABLE IF NOT EXISTS elections (
  election_id TEXT PRIMARY KEY,
  constituency_id TEXT NOT NULL DEFAULT '',
  candidates JSONB NOT NULL DEFAULT '[]',
  phase INTEGER NOT NULL DEFAULT 0,
  registered_count BIGINT NOT NULL DEFAULT 0,
  voted_count BIGINT NOT NULL DEFAULT 0,
  group_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS votes (
  vote_hash TEXT PRIMARY KEY,
  election_id TEXT NOT NULL,
  nullifier TEXT NOT NULL,
  candidate_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ,
  UNIQUE (tx_hash, log_index),
  UNIQUE (election_id, nullifier)
);

CREATE TABLE IF NOT EXISTS group_members (
  election_id TEXT NOT NULL,
  identity_commitment TEXT NOT NULL,
  leaf_index BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  PRIMARY KEY (election_id, identity_commitment),
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS phase_changes (
  id SERIAL PRIMARY KEY,
  election_id TEXT NOT NULL,
  new_phase INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
