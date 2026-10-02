import { expect } from "chai";
import { ethers } from "hardhat";
import { ECIMultiSig__factory, ElectionManager__factory } from "../typechain-types";
import { Semaphore__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/Semaphore__factory";
import { SemaphoreVerifier__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/base/SemaphoreVerifier__factory";
import { PoseidonT3__factory } from "../typechain-types/factories/poseidon-solidity/PoseidonT3__factory";

/// @notice Minimal smoke test: deploy Semaphore + multisig + ElectionManager,
///   create an election through the multisig, and check its initial state.
describe("AIA Vote smoke", function () {
  it("deploys everything and creates an election", async function () {
    const [owner1, owner2, registrar] = await ethers.getSigners();

    const verifier = await new SemaphoreVerifier__factory(owner1).deploy();
    await verifier.waitForDeployment();

    const poseidon = await new PoseidonT3__factory(owner1).deploy();
    await poseidon.waitForDeployment();

    const semaphore = await new Semaphore__factory(
      { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
      owner1
    ).deploy(await verifier.getAddress());
    await semaphore.waitForDeployment();

    const multisig = await new ECIMultiSig__factory(owner1).deploy(
      [owner1.address, owner2.address],
      2
    );
    await multisig.waitForDeployment();

    const manager = await new ElectionManager__factory(owner1).deploy(
      await multisig.getAddress(),
      await semaphore.getAddress(),
      registrar.address
    );
    await manager.waitForDeployment();

    const data = manager.interface.encodeFunctionData("createElection", [
      "KA-BLR-SOUTH",
      ["Alice", "Bob"],
    ]);
    const managerAddr = await manager.getAddress();

    await (await multisig.connect(owner1).submit(managerAddr, data)).wait();
    await (await multisig.connect(owner1).approve(0)).wait();
    await (await multisig.connect(owner2).approve(0)).wait();
    await (await multisig.execute(0)).wait();

    expect(await manager.electionCounter()).to.equal(1);

    const [constituencyId, candidates, phase, registered, voted] =
      await manager.getElection(0);
    expect(constituencyId).to.equal("KA-BLR-SOUTH");
    expect(candidates).to.deep.equal(["Alice", "Bob"]);
    expect(phase).to.equal(0); // Setup
    expect(registered).to.equal(0);
    expect(voted).to.equal(0);
    expect(await manager.getTally(0)).to.deep.equal([0n, 0n]);

    // multisig owns the manager, not an EOA
    expect(await multisig.getAddress()).to.equal(await manager.multisig());
    expect(registrar.address).to.equal(await manager.registrar());
  });
});
