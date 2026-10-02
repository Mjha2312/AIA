// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// Test/deploy helper only: importing the Semaphore implementation here makes
// Hardhat compile it and emit artifacts (Semaphore, SemaphoreVerifier) so
// tests and scripts can deploy the protocol locally. No on-chain logic.
import "@semaphore-protocol/contracts/Semaphore.sol";
import "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
