# Scale note: from prototype to national elections

One page on what this design can and cannot do at the scale of Indian general
elections. Figures are estimates, not claims.

## Shape of the problem

- A Lok Sabha constituency has roughly 1.5–2M electors. There are 543 of them,
  polled in phases over several weeks. The unit of scale is therefore one
  constituency election with ~2M eligible voters, not one national group.
- This prototype models exactly that: **one `ElectionManager` election (and one
  Semaphore group) per constituency**. Groups never span constituencies, so
  registration, voting, and tallying all partition naturally.

## Semaphore group size and tree depth

- A Semaphore group is a Merkle tree; depth `d` holds up to `2^d` members.
  Covering 2M electors needs depth 21 (`2^21 ≈ 2.1M`).
- The Semaphore contracts accept depths 1–32, so depth 21 is within limits, and
  the JS `Group` grows dynamically. No protocol change is needed for group size.
- Costs that do grow: client-side proving time and memory increase with depth,
  and the on-chain group stores one leaf per registered voter (~2M
  `addMember` calls per constituency, each a transaction from the registrar).
  Registration is the heaviest on-chain operation in this design, and it is
  spread over the registration window, not polling day.

## Voting throughput and gas

- Each vote is one `castVote` transaction carrying a Groth16 proof. On-chain
  verification cost is roughly constant per vote (ordering: proof verification
  dominates; Merkle membership is a root lookup, not a per-level hash).
- Rough arithmetic for one constituency: 1.3M votes cast (65% turnout) at ~1M
  gas each is ~1.3T gas. At 30M gas per block and 2s blocks, that is on the
  order of a full day of dedicated chain capacity per constituency — feasible
  only because constituencies poll on different days and each could run on its
  own chain/partition. A single shared chain for all 543 constituencies on one
  polling day does not fit in this budget.
- **Why a permissioned chain with ECI validators:** blocks are produced by
  known ECI validators under QBFT, not by anonymous miners. That gives
  predictable block times, zero-fee transactions for voters (fees would be a
  poll tax in effect), no MEV reordering of votes, and governance over who
  validates. The tradeoff is explicit: trust shifts from proof-of-work/stake
  decentralization to the ECI validator set and the multisig that owns
  `ElectionManager`.

## Relayer batching

- Voters sign proofs client-side; a backend relayer submits `castVote` for
  them, so voters need no ETH, no wallet UX, and no direct chain access.
- Batching here means operational batching (one relayer submitting many votes,
  retrying, and absorbing gas), not cryptographic aggregation: every proof is
  still verified individually on-chain. True aggregation (many votes, one
  proof) is out of scope for the prototype.

## What is NOT solved in this prototype

- **National-scale throughput testing.** Nothing here has been load-tested at
  2M voters or ~1M votes/day. The numbers above are back-of-envelope; real
  bottlenecks (RPC ingress, event indexing for `VoteCast`, explorer queries,
  relayer queues) are unmeasured.
- **Real Aadhaar integration.** KYC is fully mocked. Production would need
  Aadhaar/DigiLocker verification bound to exactly one registration per person
  per election, without ever putting identity data on-chain — an unsolved
  integration task, not just plumbing.
- **Coercion resistance.** A voter can be forced to reveal how they voted
  (screenshots, forced proof generation). Fixing that needs a scheme like MACI
  (key-switching so a coerced vote can be overridden), which this prototype
  does not implement. Semaphore gives anonymity, not coercion resistance.
