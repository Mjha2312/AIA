import { ethers } from "hardhat";
import type { ContractTransactionResponse } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { ECIMultiSig__factory, ElectionManager__factory } from "../typechain-types";
import { Semaphore__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/Semaphore__factory";
import { SemaphoreVerifier__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/base/SemaphoreVerifier__factory";
import { PoseidonT3__factory } from "../typechain-types/factories/poseidon-solidity/PoseidonT3__factory";
import type { ECIMultiSig, ElectionManager } from "../typechain-types";

/// @notice Shape of ISemaphore.SemaphoreProof as accepted by ethers.
export interface ContractProof {
  merkleTreeDepth: bigint;
  merkleTreeRoot: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  points: bigint[];
}

/// @notice Deploy Semaphore, a multisig and the manager. Multisig owners default
///   to the first 2 signers with threshold 2; override via params.
export async function deployAll(owners?: HardhatEthersSigner[], threshold?: number) {
  const signers = await ethers.getSigners();
  const msOwners = owners ?? [signers[0], signers[1]];
  const registrar = signers[signers.length - 1];

  const verifier = await new SemaphoreVerifier__factory(signers[0]).deploy();
  await verifier.waitForDeployment();

  const poseidon = await new PoseidonT3__factory(signers[0]).deploy();
  await poseidon.waitForDeployment();

  const semaphore = await new Semaphore__factory(
    { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
    signers[0]
  ).deploy(await verifier.getAddress());
  await semaphore.waitForDeployment();

  const multisig = await new ECIMultiSig__factory(signers[0]).deploy(
    msOwners.map((o) => o.address),
    threshold ?? msOwners.length
  );
  await multisig.waitForDeployment();

  const manager = await new ElectionManager__factory(signers[0]).deploy(
    await multisig.getAddress(),
    await semaphore.getAddress(),
    registrar.address
  );
  await manager.waitForDeployment();

  return { signers, msOwners, registrar, verifier, poseidon, semaphore, multisig, manager };
}

/// @notice Run a multisig transaction: submit + collect approvals + execute.
/// @dev `approvers` must hold enough distinct owner approvals to meet threshold.
/// @return The (mined) execute transaction, so tests can assert emitted events.
export async function multisigExec(
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  target: string,
  data: string
): Promise<ContractTransactionResponse> {
  const txId = await multisig.txCount();
  await (await multisig.connect(approvers[0]).submit(target, data)).wait();
  for (const approver of approvers) {
    await (await multisig.connect(approver).approve(txId)).wait();
  }
  const tx = await multisig.execute(txId);
  await tx.wait();
  return tx;
}

/// @notice Create an election through the multisig; returns the new election id.
export async function createElection(
  manager: ElectionManager,
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  constituencyId: string,
  candidates: string[]
): Promise<number> {
  const data = manager.interface.encodeFunctionData("createElection", [constituencyId, candidates]);
  await multisigExec(multisig, approvers, await manager.getAddress(), data);
  return Number(await manager.electionCounter()) - 1;
}

/// @notice Advance an election one phase through the multisig.
/// @return The (mined) execute transaction, so tests can assert emitted events.
export async function advancePhase(
  manager: ElectionManager,
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  electionId: number
): Promise<ContractTransactionResponse> {
  const data = manager.interface.encodeFunctionData("advancePhase", [electionId]);
  return multisigExec(multisig, approvers, await manager.getAddress(), data);
}

/// @notice Build a Semaphore proof (scope/message as plain numbers) and map it
///   to the struct shape the ElectionManager contract expects.
export async function makeVoteProof(
  identity: Identity,
  group: Group,
  message: number,
  scope: number
): Promise<ContractProof> {
  const proof = await generateProof(identity, group, message, scope);
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message),
    scope: BigInt(proof.scope),
    points: proof.points.map((p: string | bigint) => BigInt(p)),
  };
}

/// @notice keccak256(abi.encode(uint256 electionId, uint256 nullifier, uint256 candidateIndex)).
export function voteHash(electionId: number, nullifier: bigint, candidateIndex: number): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256"],
      [electionId, nullifier, candidateIndex]
    )
  );
}

/// @notice keccak256(abi.encode(uint256[] tally)) as emitted in TallyFinalized.
export function tallyHash(tally: bigint[]): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [tally])
  );
}
