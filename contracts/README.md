# contracts — on-chain package (owner: chain dev)

Solidity `ECIMultiSig` + `ElectionManager` (see `../docs/SPEC.md`), Hardhat + TypeScript.

## Run locally (exact commands)

```bash
cd contracts
npm install
npm run lint          # hardhat compile + tsc --noEmit
npm test              # 35 tests: multisig, election, e2e with real Semaphore proofs
npm run coverage      # 100% lines/functions on both contracts

# local chain + deploy (two terminals):
npm run node          # terminal 1: hardhat node on :8545 (leave running)
npm run deploy:local  # terminal 2: deploys stack, writes deployments/localhost.json
npm run abi           # export ABIs to abi/ (committed for the backend)
```

Deploy env (all optional on localhost): `MULTISIG_OWNERS` (comma-separated,
default first 3 accounts), `MULTISIG_THRESHOLD` (default 2), `REGISTRAR_ADDRESS`
or `REGISTRAR_PRIVATE_KEY` (default 4th account). Fresh `npm run node` +
`npm run deploy:local` reproduces `deployments/localhost.json` deterministically.

## Trust model: who can do what

- **ECI multisig (`ECIMultiSig`)** — the root of trust. Its owners (ECI key-holders,
  threshold-of-n) are the ONLY actors that can create elections, advance phases
  (exactly one step at a time), rotate the registrar (once), or otherwise call
  `ElectionManager` admin functions. Every admin action is a multisig
  submit → approve(s) → execute transaction, emitted as events.
- **Registrar (backend wallet)** — the ONLY actor that can add voters, and only
  during the Registration phase, by inserting identity commitments into the
  election's Semaphore group. It cannot create elections, move phases, or vote.
  It never sees Aadhaar/PII on-chain: only opaque commitments.
- **Anyone (relayers)** — may call `castVote` during the Voting phase by submitting
  a valid Semaphore proof (scope = electionId, message = candidateIndex).
  Double votes are rejected by Semaphore nullifier tracking; the contract also
  rejects scope/message mismatches and out-of-range candidates.
- **Voters** — hold their Semaphore identity client-side. Chain and backend never
  link a vote (nullifier) back to an identity commitment or a person.
- **Readers/indexers** — `getTally` / `getElection` are view functions; all state
  changes emit events (`ElectionCreated`, `PhaseChanged`, `VoterRegistered`,
  `VoteCast`, `TallyFinalized`) for the backend indexer and public explorer.

No upgradeability, no ETH held, no PII on-chain. Prototype: local Hardhat network
stands in for the ECI permissioned chain.
