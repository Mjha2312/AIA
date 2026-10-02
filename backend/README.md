# backend — API + relayer + indexer (owner: API dev)

Express + TypeScript API for AIA Vote per `docs/SPEC.md` (base path `/api`).
This PR implements **KYC + registration**; elections/relay/audit/WS come later.

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
npm test        # vitest + supertest (no DB or chain needed)
npm run lint    # eslint
npm run build   # tsc -> dist/ ; run with npm start
```

## API (this PR)

- `GET /api/health` -> `{ ok: true }`
- `POST /api/kyc/start` `{ electionId }` -> `{ sessionId, redirectUrl }`
- `POST /api/kyc/complete` `{ sessionId, mockEpic? }` -> `{ kycToken }`
  (`kycToken`: JWT, 10 min expiry, carries `subjectId` + `electionId`)
- `POST /api/register` `{ kycToken, electionId, identityCommitment }` -> `{ txHash }`
  - `409 { error: { code: "ALREADY_REGISTERED" } }` on duplicate
  - On-chain failure rolls back the DB insert (`502 CHAIN_ERROR`) so retry works.

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

## Privacy (SPEC hard requirements — hold in this PR)

- DB stores **only** `eligibilityHash = HMAC-SHA256(SERVER_SECRET, subjectId + ":" + electionId)`
  (`registrations` table, unique per election). No Aadhaar, EPIC, `subjectId`,
  or `identityCommitment` is persisted; the raw `subjectId` lives only inside
  the short-lived JWT and server memory.
- Logs redact `kycToken`/`mockEpic`/`subjectId`; access logs never include
  bodies, so commitments and subject ids stay out of logs together.
