// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ECIMultiSig
/// @notice Minimal m-of-n multisig that owns ElectionManager.
/// @dev Audited-style, no upgradeability, no value handling.
///   Simplification choices (SPEC is silent): submit does NOT auto-approve;
///   any address may call execute once the threshold is met.
contract ECIMultiSig {
    /// @notice Thrown when the caller is not an owner.
    error NotOwner();
    /// @notice Thrown for bad constructor params (empty owners, bad threshold, zero/duplicate owner).
    error InvalidSetup();
    /// @notice Thrown when the tx id does not exist.
    error TxNotFound();
    /// @notice Thrown when the tx was already executed.
    error AlreadyExecuted();
    /// @notice Thrown when an owner approves the same tx twice.
    error AlreadyApproved();
    /// @notice Thrown when approvals are below threshold at execution time.
    error ThresholdNotMet();
    /// @notice Thrown when the target call itself fails.
    error ExecutionFailed();

    /// @notice A multisig transaction: a call into `target` with `data`.
    struct Transaction {
        address target;
        bytes data;
        uint256 approvals;
        bool executed;
    }

    /// @notice Owner registry.
    mapping(address => bool) public isOwner;
    /// @notice Number of owners (frozen after construction).
    uint256 public ownerCount;
    /// @notice Approvals required to execute.
    uint256 public threshold;
    /// @notice All submitted transactions.
    Transaction[] public transactions;
    /// @notice txId => owner => approved.
    mapping(uint256 => mapping(address => bool)) public approved;

    /// @notice Emitted when a transaction is submitted.
    /// @param txId Index in `transactions`.
    /// @param submitter Owner that submitted it.
    /// @param target Call target.
    event Submitted(uint256 indexed txId, address indexed submitter, address indexed target);
    /// @notice Emitted when an owner approves.
    /// @param txId Approved transaction.
    /// @param owner Approving owner.
    event Approved(uint256 indexed txId, address indexed owner);
    /// @notice Emitted when a transaction executes.
    /// @param txId Executed transaction.
    event Executed(uint256 indexed txId);

    /// @param owners ECI key-holder addresses.
    /// @param _threshold Approvals required to execute (1 <= threshold <= owners.length).
    constructor(address[] memory owners, uint256 _threshold) {
        if (owners.length == 0 || _threshold == 0 || _threshold > owners.length) revert InvalidSetup();
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == address(0) || isOwner[owners[i]]) revert InvalidSetup();
            isOwner[owners[i]] = true;
        }
        ownerCount = owners.length;
        threshold = _threshold;
    }

    /// @notice Submit a transaction for approval. Only owners.
    /// @param target Contract to call on execution.
    /// @param data Calldata to forward.
    /// @return txId New transaction id.
    function submit(address target, bytes calldata data) external returns (uint256 txId) {
        if (!isOwner[msg.sender]) revert NotOwner();
        txId = transactions.length;
        transactions.push(Transaction({target: target, data: data, approvals: 0, executed: false}));
        emit Submitted(txId, msg.sender, target);
    }

    /// @notice Approve a pending transaction. Each owner once. Only owners.
    /// @param txId Transaction to approve.
    function approve(uint256 txId) external {
        if (!isOwner[msg.sender]) revert NotOwner();
        if (txId >= transactions.length) revert TxNotFound();
        Transaction storage txn = transactions[txId];
        if (txn.executed) revert AlreadyExecuted();
        if (approved[txId][msg.sender]) revert AlreadyApproved();
        approved[txId][msg.sender] = true;
        txn.approvals += 1;
        emit Approved(txId, msg.sender);
    }

    /// @notice Execute a transaction that reached threshold. Callable by anyone.
    /// @dev Checks-effects-interactions: marked executed before the external call.
    /// @param txId Transaction to execute.
    function execute(uint256 txId) external {
        if (txId >= transactions.length) revert TxNotFound();
        Transaction storage txn = transactions[txId];
        if (txn.executed) revert AlreadyExecuted();
        if (txn.approvals < threshold) revert ThresholdNotMet();
        txn.executed = true;
        (bool ok, ) = txn.target.call(txn.data);
        if (!ok) revert ExecutionFailed();
        emit Executed(txId);
    }

    /// @notice Number of submitted transactions.
    function txCount() external view returns (uint256) {
        return transactions.length;
    }
}
