# AGENTS.md — AIA Vote (opencode instructions)

## Project summary (5 lines)
1. AIA Vote is an Aadhaar-gated permissioned-blockchain e-voting prototype for the Election Commission of India.
2. Three packages work in parallel: `contracts/` (Solidity), `backend/` (Express API + relayer + indexer), `web/` (Next.js voter app + explorer).
3. Voter privacy uses Semaphore ZK groups: chain sees only identity commitments, proofs, and nullifiers — never Aadhaar or PII.
4. The chain runs an EVM shadow-audit mode: on-chain tally is cross-checked against booth EVM counts via `POST /elections/:id/audit`.
5. Remote voting targets migrants/NRIs, with Aadhaar/DigiLocker fully mocked in this prototype.

Read docs/SPEC.md before any task. It is the source of truth. Never change it in a feature PR. If you need a spec change, describe it in the PR description and stop.

## Ownership
- Stay inside your assigned directory. Never edit another package.
- Assigned areas: `contracts/` (chain dev), `backend/` (API dev), `web/` (frontend dev).
- Shared files (`docs/SPEC.md`, `docker-compose.yml`, `.env.example`, `.github/`, `AGENTS.md`, `README.md`) are read-only in feature PRs unless the PR is explicitly a scaffold/infra PR.

## Stack
- TypeScript everywhere, Node 20, pnpm workspaces is NOT used; each package has its own package.json and lockfile.
- Contracts: Solidity ^0.8.23, Hardhat, TypeScript tests.
- Backend: Express + TypeScript, Postgres, ethers/viem, Semaphore.
- Web: Next.js + TypeScript.

## Conventions
- Conventional commits (feat:, fix:, test:, docs:), small PRs, no secrets committed, .env never committed.
- Keep PRs under ~300 lines of diff where possible. One logical change per PR.
- Never commit secrets, private keys, JWT secrets, or `.env` files. Use `.env.example` placeholders only.

## PR workflow
- Create branch feat/<area>-<task>, run lint+test, push, open PR with `gh pr create --base main` using the template. Never merge your own PR. Never push to main.
- Example: `git checkout -b feat/contracts-election-manager`, `npm run lint && npm test`, `git push -u origin feat/contracts-election-manager`, then `gh pr create --base main`.
- Fill in the PR template completely, including the Spec impact section.
- Wait for review from the admin/CODEOWNER before merging.

## Privacy (hard requirements from SPEC)
- Privacy rules from SPEC are hard requirements.
- Never store Aadhaar numbers. Backend stores only eligibilityHash = HMAC-SHA256(SERVER_SECRET, kycSubjectId + ":" + electionId).
- Never log identityCommitments together with kycSubjectId. Never log IPs on /relay/vote.
- Any PR that touches KYC, registration, or relay code must confirm in the PR description that these rules still hold.

## Ambiguity rule
- If something in the spec is ambiguous, pick the simplest option, document it in the PR, and continue.
