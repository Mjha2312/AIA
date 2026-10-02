-- AIA Vote backend migrations.
-- Applied in filename order and tracked in the `migrations` table.
-- 001: base schema (migrations tracking + voter registrations).

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (election, person). Only the eligibility hash is stored —
-- never Aadhaar, EPIC, kycSubjectId, or identityCommitment (see docs/SPEC.md).
CREATE TABLE IF NOT EXISTS registrations (
  election_id TEXT NOT NULL,
  eligibility_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, eligibility_hash)
);
