# backend — API + relayer + indexer (owner: API dev)

Express + TypeScript API for AIA Vote per `docs/SPEC.md` (base path `/api`).
Implements **KYC + registration, vote relay, chain indexer, and `/ws`
broadcasts**; elections/audit/tally read endpoints come later.

## Run

```bash
cd backend
cp ../.env.example .env   # then fill in secrets; never commit .env
npm install
npm run migrate           # applies backend/migrations/*.sql in order
npm run dev               # tsx watch, serves on $PORT (default 4000)
```

Without Postgres running, the server still boots with an in-memory
registration store (dev only — uniqueness is then process-local).
Without a chain / contract artifacts, `ElectionManager.registerVoter` is
served by an in-memory fake (`CHAIN_MODE=fake` forces this; `auto` uses the
live registrar when `contracts/abi` + `contracts/deployments/localhost.json`
are present).

```bash
npm test        # vitest + supertest (no DB or chain needed; integration test
                # runs too if a Hardhat node is up on $RPC_URL, else skips)
npm run lint    # eslint
npm run build   # tsc -> dist/ ; run with npm start
```

## API

- `GET /api/health` -> `{ ok: true }`
- `POST /api/kyc/start` `{ electionId }` -> `{ sessionId, redirectUrl }`
- `POST /api/kyc/complete` `{ sessionId, mockEpic? }` -> `{ kycToken }`
  (`kycToken`: JWT, 10 min expiry, carries `subjectId` + `electionId`)
- `POST /api/register` `{ kycToken, electionId, identityCommitment }` -> `{ txHash }`
  - `409 { error: { code: "ALREADY_REGISTERED" } }` on duplicate
  - On-chain failure rolls back the DB insert (`502 CHAIN_ERROR`) so retry works.
- `POST /api/relay/vote` `{ electionId, candidateIndex, proof }` -> `{ txHash, voteHash }`
  - `proof` is the Semaphore struct: `merkleTreeDepth`, `merkleTreeRoot`,
    `nullifier`, `message`, `scope` (decimal strings) + `points[8]`.
  - Cheap pre-checks first (no gas spent): election exists (`404
    ELECTION_NOT_FOUND`), phase is Voting (`409 WRONG_PHASE`), candidate in
    range (`400 INVALID_CANDIDATE`), `scope == electionId` (`400
    SCOPE_MISMATCH`), `message == candidateIndex` (`400 MESSAGE_MISMATCH`).
  - Chain reverts map to clean errors: double vote `409 ALREADY_VOTED`,
    bad proof `400 INVALID_PROOF`, mining timeout `504 TX_TIMEOUT`.
  - Votes queue at concurrency 1 per relayer wallet with a local nonce
    manager, so concurrent requests never collide on nonces.

Errors look like `{ error: { code, message } }` with proper HTTP status.

## curl examples (mock KYC)

```bash
BASE=http://localhost:4000/api

curl $BASE/health

S=$(curl -s -X POST $BASE/kyc/start -H 'Content-Type: application/json' \
  -d '{"electionId":"1"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["sessionId"])')

TOKEN=$(curl -s -X POST $BASE/kyc/complete -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$S\",\"mockEpic\":\"WB/12/345/678901\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["kycToken"])')

curl -X POST $BASE/register -H 'Content-Type: application/json' -d "{
  \"kycToken\": \"$TOKEN\",
  \"electionId\": \"1\",
  \"identityCommitment\": \"1234567890123456789012345678901234567890\"
}"
```

## Relay curl (needs a Voting-phase election + real proof)

```bash
# proof comes from @semaphore-protocol/proof generateProof(identity, group,
# candidateIndex, electionId) with decimal-string fields; example shape:
curl -X POST $BASE/relay/vote -H 'Content-Type: application/json' -d '{
  "electionId": "1",
  "candidateIndex": 0,
  "proof": {
    "merkleTreeDepth": "20", "merkleTreeRoot": "111", "nullifier": "222",
    "message": "0", "scope": "1",
    "points": ["1","2","3","4","5","6","7","8"]
  }
}'
# -> {"txHash":"0x...","voteHash":"0x..."}
```

## Indexer + WebSocket

- The indexer (`src/indexer/`) follows `ElectionManager` over `WS_RPC_URL`,
  persists `ElectionCreated`, `PhaseChanged`, `VoterRegistered`, `VoteCast`,
  `TallyFinalized` into Postgres (`002_indexer.sql`: `elections`, `votes`,
  `group_members`, `phase_changes`, `indexer_state`), and broadcasts
  `{ type: "VoteCast"|"PhaseChanged"|"VoterRegistered", ... }` on `/ws`.
- Startup: backfills from the stored checkpoint (or `INDEXER_FROM_BLOCK`)
  to head in chunks, then goes live; socket drops reconnect with backoff and
  re-backfill the gap. Every write is idempotent on `(txHash, logIndex)`.
- Env knobs (all defaulted; see `src/config.ts`): `WS_RPC_URL`
  (`ws://localhost:8545`), `RELAYER_PRIVATE_KEY`, `RELAY_TX_TIMEOUT_MS`
  (60000), `INDEXER_ENABLED` (true), `INDEXER_FROM_BLOCK` (0).
- Connect: `new WebSocket("ws://localhost:4000/ws")`. Payloads are
  chain-public data only (ids, counts, hashes) — nothing KYC-linkable.

## Privacy (SPEC hard requirements — hold in this PR)

- DB stores **only** `eligibilityHash = HMAC-SHA256(SERVER_SECRET, subjectId + ":" + electionId)`
  (`registrations` table, unique per election). No Aadhaar, EPIC, `subjectId`,
  or `identityCommitment` is persisted; the raw `subjectId` lives only inside
  the short-lived JWT and server memory.
- Logs redact `kycToken`/`mockEpic`/`subjectId`; access logs never include
  bodies, so commitments and subject ids stay out of logs together.
- `POST /api/relay/vote` writes **no access log at all** (no IP, headers, or
  user agent — SPEC), and its route logger records only `{ electionId,
  txHash }` / error codes via a redacted child logger. A test asserts the
  relay logger output carries no IP.
- The indexer stores chain-public data only; `/ws` payloads contain no
  KYC-linkable fields (asserted in tests).
