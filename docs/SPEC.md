# AIA Vote Shared Spec (source of truth)

## Domain
- Election: id (uint256), constituencyId (string), candidates (string[]), phase.
- Phases (enum, in order): Setup=0, Registration=1, Voting=2, Tallying=3, Finalized=4.
- Voter privacy: chain never sees Aadhaar or PII. Voters hold a Semaphore identity (client-side).
  Backend verifies KYC, then registers the voter's identityCommitment into the election's Semaphore group.
  Votes are Semaphore proofs: scope = electionId, message = candidateIndex.
  Nullifier prevents double voting. Candidate choice is public, voter identity is not linkable.

## Contracts (Solidity ^0.8.23, Hardhat, TypeScript)
ECIMultiSig:
  constructor(address[] owners, uint256 threshold)
  submit(address target, bytes data) returns (uint256 txId)
  approve(uint256 txId)
  execute(uint256 txId)
  events: Submitted, Approved, Executed
ElectionManager (uses Semaphore; owner = ECIMultiSig; registrar = backend wallet):
  createElection(string constituencyId, string[] candidates) returns (uint256 electionId)   // onlyMultiSig
  advancePhase(uint256 electionId)                                                           // onlyMultiSig, +1 phase only
  registerVoter(uint256 electionId, uint256 identityCommitment)                              // onlyRegistrar, Registration phase
  castVote(uint256 electionId, uint256 candidateIndex, ISemaphore.SemaphoreProof proof)      // Voting phase, anyone may relay
  getTally(uint256 electionId) returns (uint256[])
  getElection(uint256 electionId) returns (constituencyId, candidates, phase, registeredCount, votedCount)
  events:
    ElectionCreated(electionId, constituencyId)
    PhaseChanged(electionId, newPhase)
    VoterRegistered(electionId, identityCommitment)
    VoteCast(electionId, nullifier, candidateIndex, voteHash)   // voteHash = keccak256(electionId, nullifier, candidateIndex)
    TallyFinalized(electionId, tallyHash)
Artifacts: contracts/abi/*.json and contracts/deployments/<network>.json ({ ECIMultiSig, ElectionManager, Semaphore, chainId }).

## Backend REST API (base: /api, JSON, Express + TypeScript)
GET  /elections                          -> Election[]
GET  /elections/:id                      -> Election (+ tally if phase >= Tallying)
GET  /elections/:id/turnout              -> { registered, voted, turnoutPct }
GET  /elections/:id/votes?cursor=&limit= -> { items: [{ voteHash, nullifier, candidateIndex, txHash, blockNumber, timestamp }], nextCursor }
GET  /elections/:id/group                -> { members: string[] }   // identity commitments, for client-side Merkle tree
GET  /receipts/:nullifier                -> { found, voteHash, txHash, blockNumber, timestamp }
POST /kyc/start     { electionId }                         -> { sessionId, redirectUrl }
POST /kyc/complete  { sessionId, mockEpic? }               -> { kycToken }   // short-lived JWT
POST /register      { kycToken, electionId, identityCommitment } -> { txHash }
POST /relay/vote    { electionId, candidateIndex, proof }  -> { txHash, voteHash }
POST /elections/:id/audit { booths: [{ boothId, counts: number[] }] } -> { match: boolean, chainTally: number[], evmTally: number[], diff: number[] }
WebSocket /ws                            -> pushes { type: "VoteCast"|"PhaseChanged"|"VoterRegistered", ... }
Errors: { error: { code: string, message: string } } with proper HTTP status.

## Privacy rules (DPDP)
- Never store Aadhaar numbers. Backend stores only eligibilityHash = HMAC-SHA256(SERVER_SECRET, kycSubjectId + ":" + electionId) to enforce one registration per person per election.
- Never log identityCommitments together with kycSubjectId. Never log IPs on /relay/vote.

## Ports and env
- Hardhat node 8545, backend 4000, web 3000, Postgres 5432. All config via .env (see .env.example).
