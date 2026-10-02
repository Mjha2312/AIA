// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @title ElectionManager
/// @notice Semaphore-based elections: anonymous voters, public tallies, ECI multisig control.
/// @dev Owner is the ECIMultiSig contract; voter registration goes through a registrar
///   (backend wallet). Each election owns one Semaphore group (this contract is group admin).
///   Votes are Semaphore proofs with scope == electionId and message == candidateIndex.
///   Nullifier double-vote protection is enforced by the Semaphore contract.
///   Simplification choices (SPEC is silent): election ids start at 0; createElection
///   requires at least one candidate; identity commitments must be non-zero;
///   setRegistrar may be used exactly once by the multisig.
contract ElectionManager {
    /// @notice Caller is not the multisig owner.
    error OnlyMultiSig();
    /// @notice Caller is not the registrar.
    error OnlyRegistrar();
    /// @notice Election id does not exist.
    error ElectionNotFound();
    /// @notice Call requires a different phase than the election is in.
    error WrongPhase();
    /// @notice Election must list at least one candidate.
    error NoCandidates();
    /// @notice candidateIndex is out of range.
    error InvalidCandidate();
    /// @notice Identity commitment must be non-zero.
    error InvalidCommitment();
    /// @notice Proof scope must equal the election id.
    error ScopeMismatch();
    /// @notice Proof message must equal the candidate index.
    error MessageMismatch();
    /// @notice Registrar can only be rotated once by the multisig.
    error RegistrarLocked();
    /// @notice New registrar must not be the zero address.
    error InvalidRegistrar();

    /// @notice Election lifecycle, in order.
    enum Phase {
        Setup,
        Registration,
        Voting,
        Tallying,
        Finalized
    }

    /// @notice On-chain election record.
    struct Election {
        string constituencyId;
        string[] candidates;
        Phase phase;
        uint256 registeredCount;
        uint256 votedCount;
        uint256 groupId;
        uint256[] tally;
    }

    /// @notice Semaphore protocol contract.
    ISemaphore public immutable semaphore;
    /// @notice ECIMultiSig contract; the only admin of elections.
    address public immutable multisig;
    /// @notice Backend wallet allowed to register voters.
    address public registrar;
    /// @notice True once setRegistrar has been used (one rotation max).
    bool public registrarUpdated;
    /// @notice Counter for the next election id (starts at 0).
    uint256 public electionCounter;

    /// @notice electionId => Election.
    mapping(uint256 => Election) private elections;

    /// @notice Emitted when an election is created.
    event ElectionCreated(uint256 indexed electionId, string constituencyId);
    /// @notice Emitted on every phase advance.
    event PhaseChanged(uint256 indexed electionId, Phase newPhase);
    /// @notice Emitted when a voter commitment joins the group.
    event VoterRegistered(uint256 indexed electionId, uint256 identityCommitment);
    /// @notice Emitted on every valid vote.
    /// @dev voteHash = keccak256(abi.encode(electionId, nullifier, candidateIndex)).
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed nullifier,
        uint256 candidateIndex,
        bytes32 voteHash
    );
    /// @notice Emitted when entering Finalized; tallyHash = keccak256(abi.encode(tally)).
    event TallyFinalized(uint256 indexed electionId, bytes32 tallyHash);

    /// @param _multisig ECIMultiSig address (admin of all elections).
    /// @param _semaphore Semaphore protocol address.
    /// @param _registrar Initial backend registrar wallet.
    constructor(address _multisig, ISemaphore _semaphore, address _registrar) {
        if (_multisig == address(0) || address(_semaphore) == address(0) || _registrar == address(0)) {
            revert InvalidRegistrar();
        }
        multisig = _multisig;
        semaphore = _semaphore;
        registrar = _registrar;
    }

    /// @notice Restricts admin functions to the multisig (via submit/approve/execute).
    modifier onlyMultiSig() {
        if (msg.sender != multisig) revert OnlyMultiSig();
        _;
    }

    /// @notice Rotate the registrar exactly once. Multisig only.
    /// @param newRegistrar Replacement backend wallet.
    function setRegistrar(address newRegistrar) external onlyMultiSig {
        if (registrarUpdated) revert RegistrarLocked();
        if (newRegistrar == address(0)) revert InvalidRegistrar();
        registrarUpdated = true;
        registrar = newRegistrar;
    }

    /// @notice Create an election and its Semaphore group (admin = this contract). Multisig only.
    /// @param constituencyId Human-readable constituency label.
    /// @param candidates Candidate names.
    /// @return electionId New election id.
    function createElection(
        string calldata constituencyId,
        string[] calldata candidates
    ) external onlyMultiSig returns (uint256 electionId) {
        if (candidates.length == 0) revert NoCandidates();
        electionId = electionCounter++;
        uint256 groupId = semaphore.createGroup(address(this));

        Election storage e = elections[electionId];
        e.constituencyId = constituencyId;
        e.phase = Phase.Setup;
        e.groupId = groupId;
        for (uint256 i = 0; i < candidates.length; i++) {
            e.candidates.push(candidates[i]);
            e.tally.push(0);
        }
        emit ElectionCreated(electionId, constituencyId);
    }

    /// @notice Advance exactly one phase forward. Multisig only.
    /// @dev Finalizing (Tallying -> Finalized) emits TallyFinalized.
    /// @param electionId Election to advance.
    function advancePhase(uint256 electionId) external onlyMultiSig {
        if (electionId >= electionCounter) revert ElectionNotFound();
        Election storage e = elections[electionId];
        if (e.phase == Phase.Finalized) revert WrongPhase();
        e.phase = Phase(uint256(e.phase) + 1);
        emit PhaseChanged(electionId, e.phase);
        if (e.phase == Phase.Finalized) {
            emit TallyFinalized(electionId, keccak256(abi.encode(e.tally)));
        }
    }

    /// @notice Add a voter's identity commitment to the election's Semaphore group.
    /// @dev Registrar only, Registration phase only.
    /// @param electionId Election to register for.
    /// @param identityCommitment Voter's Semaphore identity commitment (never PII).
    function registerVoter(uint256 electionId, uint256 identityCommitment) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        if (electionId >= electionCounter) revert ElectionNotFound();
        Election storage e = elections[electionId];
        if (e.phase != Phase.Registration) revert WrongPhase();
        if (identityCommitment == 0) revert InvalidCommitment();
        semaphore.addMember(e.groupId, identityCommitment);
        e.registeredCount += 1;
        emit VoterRegistered(electionId, identityCommitment);
    }

    /// @notice Cast a vote via a Semaphore proof. Anyone may relay. Voting phase only.
    /// @dev Checks (phase, candidate, scope, message) run before the external
    ///   validateProof call; state updates follow it. A revert anywhere rolls back.
    /// @param electionId Election to vote in.
    /// @param candidateIndex Chosen candidate (public).
    /// @param proof Semaphore proof with scope == electionId, message == candidateIndex.
    function castVote(
        uint256 electionId,
        uint256 candidateIndex,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        if (electionId >= electionCounter) revert ElectionNotFound();
        Election storage e = elections[electionId];
        if (e.phase != Phase.Voting) revert WrongPhase();
        if (candidateIndex >= e.candidates.length) revert InvalidCandidate();
        if (proof.scope != electionId) revert ScopeMismatch();
        if (proof.message != candidateIndex) revert MessageMismatch();
        semaphore.validateProof(e.groupId, proof);
        e.tally[candidateIndex] += 1;
        e.votedCount += 1;
        bytes32 voteHash = keccak256(abi.encode(electionId, proof.nullifier, candidateIndex));
        emit VoteCast(electionId, proof.nullifier, candidateIndex, voteHash);
    }

    /// @notice Current per-candidate vote counts.
    /// @param electionId Election to query.
    /// @return counts Tally array aligned with `candidates`.
    function getTally(uint256 electionId) external view returns (uint256[] memory counts) {
        if (electionId >= electionCounter) revert ElectionNotFound();
        counts = elections[electionId].tally;
    }

    /// @notice Election metadata per SPEC.
    /// @param electionId Election to query.
    /// @return constituencyId Constituency label.
    /// @return candidates Candidate names.
    /// @return phase Current phase.
    /// @return registeredCount Registered voters.
    /// @return votedCount Votes cast.
    function getElection(
        uint256 electionId
    )
        external
        view
        returns (
            string memory constituencyId,
            string[] memory candidates,
            Phase phase,
            uint256 registeredCount,
            uint256 votedCount
        )
    {
        if (electionId >= electionCounter) revert ElectionNotFound();
        Election storage e = elections[electionId];
        return (e.constituencyId, e.candidates, e.phase, e.registeredCount, e.votedCount);
    }

    /// @notice Semaphore group id backing an election (needed by the backend indexer).
    /// @param electionId Election to query.
    function getGroupId(uint256 electionId) external view returns (uint256) {
        if (electionId >= electionCounter) revert ElectionNotFound();
        return elections[electionId].groupId;
    }
}
