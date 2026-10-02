# backend — API + relayer + indexer (owner: API dev)

Express + TypeScript API for AIA Vote per `docs/SPEC.md` (base path `/api`).
Implements **KYC + registration, vote relay, chain indexer, `/ws`
broadcasts, public read endpoints, and the EVM shadow-audit**.

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

## Public reads (backed by the indexer tables)

- `GET /api/elections` -> `Election[]` (`id`, `constituencyId`, `candidates`, `phase`)
- `GET /api/elections/:id` -> detail + `registeredCount`/`votedCount`, plus
  `tally` **only when phase >= Tallying(3)** (computed from the `votes` table)
- `GET /api/elections/:id/turnout` -> `{ registered, voted, turnoutPct }`
  (`turnoutPct` rounded to 2 decimals, 0 when nobody is registered)
- `GET /api/elections/:id/votes?cursor=&limit=` (default 50, max 200) ->
  `{ items: [{ voteHash, nullifier, candidateIndex, txHash, blockNumber,
  timestamp }], nextCursor }`, stable order by `(blockNumber, logIndex)`
- `GET /api/elections/:id/group` -> `{ members: string[] }` (leaf_index order,
  for the client-side Merkle tree)
- `GET /api/receipts/:nullifier` -> `{ found: true, voteHash, txHash,
  blockNumber, timestamp }` or `{ found: false }`
- Full contract in `backend/openapi.yaml`; browse at `/api/docs` (Swagger UI).

## Shadow-audit

```bash
curl -X POST $BASE/elections/1/audit -H 'Content-Type: application/json' \
  -H "x-admin-key: $ADMIN_API_KEY" -d '{
    "booths": [
      {"boothId": "b1", "counts": [120, 98]},
      {"boothId": "b2", "counts": [45, 51]}
    ]
  }'
# -> {"match":true,"chainTally":[165,149],"evmTally":[165,149],"diff":[0,0]}
```

- Booth counts are summed per candidate and compared to the chain tally from
  the `votes` table; every booth's `counts` length must equal the candidate
  count (`400 AUDIT_SHAPE_MISMATCH` otherwise). Each run is persisted
  (`audit_runs` table) and listed at `GET /api/elections/:id/audits`.
- Prototype gate: `x-admin-key` must match `ADMIN_API_KEY` (`401
  INVALID_ADMIN_KEY`; `503 AUDIT_DISABLED` when unset). **Production must use
  ECI-signed audit submissions instead** — the shared-secret header is a
  stand-in, documented here and in `openapi.yaml`.

## Mock KYC page

With `MOCK_KYC=true`, `POST /api/kyc/start` returns
`redirectUrl: /mock-kyc?sessionId=...`. That page (`GET /mock-kyc`) is plain
server-rendered HTML: the voter types a mock EPIC, the page calls
`POST /api/kyc/complete`, then redirects to
`$WEB_APP_URL/kyc/callback?sessionId=...` with the short-lived `kycToken` in
the URL **fragment** (fragments are never sent to or logged by any server).
`MOCK_KYC=false` answers 404.

## One-shot replay

```bash
npm run dev:replay   # needs Postgres + WS_RPC_URL with seeded elections
```

Runs migrations, backfills the indexer once (idempotent — re-runs only fill
gaps), prints per-table row counts (`elections`, `votes`, members,
`phase_changes`, `audits`) plus the checkpoint, and exits.

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
  (60000), `INDEXER_ENABLED` (true), `INDEXER_FROM_BLOCK` (0),
  `ADMIN_API_KEY` ("", audit disabled until set), `WEB_APP_URL`
  (`http://localhost:3000`, mock-KYC return target).
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
