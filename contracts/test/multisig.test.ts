import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployAll, multisigExec } from "./helpers";

describe("ECIMultiSig", function () {
  async function fixture() {
    return deployAll();
  }

  describe("setup", function () {
    it("stores owners and threshold", async function () {
      const { signers, multisig } = await loadFixture(fixture);
      expect(await multisig.isOwner(signers[0].address)).to.be.true;
      expect(await multisig.isOwner(signers[1].address)).to.be.true;
      expect(await multisig.isOwner(signers[2].address)).to.be.false;
      expect(await multisig.ownerCount()).to.equal(2);
      expect(await multisig.threshold()).to.equal(2);
    });

    it("reverts on empty owners", async function () {
      const MultiSig = await ethers.getContractFactory("ECIMultiSig");
      await expect(MultiSig.deploy([], 1)).to.be.revertedWithCustomError(MultiSig, "InvalidSetup");
    });

    it("reverts on zero threshold or threshold above owner count", async function () {
      const { signers } = await loadFixture(fixture);
      const MultiSig = await ethers.getContractFactory("ECIMultiSig");
      await expect(MultiSig.deploy([signers[0].address], 0)).to.be.revertedWithCustomError(
        MultiSig,
        "InvalidSetup"
      );
      await expect(MultiSig.deploy([signers[0].address], 2)).to.be.revertedWithCustomError(
        MultiSig,
        "InvalidSetup"
      );
    });

    it("reverts on zero or duplicate owner", async function () {
      const { signers } = await loadFixture(fixture);
      const MultiSig = await ethers.getContractFactory("ECIMultiSig");
      await expect(
        MultiSig.deploy([signers[0].address, ethers.ZeroAddress], 1)
      ).to.be.revertedWithCustomError(MultiSig, "InvalidSetup");
      await expect(
        MultiSig.deploy([signers[0].address, signers[0].address], 1)
      ).to.be.revertedWithCustomError(MultiSig, "InvalidSetup");
    });
  });

  describe("submit / approve / execute", function () {
    it("submit emits Submitted and returns an incrementing txId", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      await expect(multisig.connect(signers[0]).submit(await manager.getAddress(), data))
        .to.emit(multisig, "Submitted")
        .withArgs(0, signers[0].address, await manager.getAddress());
      await expect(multisig.connect(signers[0]).submit(await manager.getAddress(), data))
        .to.emit(multisig, "Submitted")
        .withArgs(1, signers[0].address, await manager.getAddress());
      expect(await multisig.txCount()).to.equal(2);
    });

    it("non-owners cannot submit or approve", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      const outsider = signers[signers.length - 1];
      // registrar (last signer) is not an owner in the 2-owner fixture
      const data = manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      await expect(
        multisig.connect(outsider).submit(await manager.getAddress(), data)
      ).to.be.revertedWithCustomError(multisig, "NotOwner");
      await (await multisig.connect(signers[0]).submit(await manager.getAddress(), data)).wait();
      await expect(multisig.connect(outsider).approve(0)).to.be.revertedWithCustomError(
        multisig,
        "NotOwner"
      );
    });

    it("rejects duplicate approval by the same owner", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      await (await multisig.connect(signers[0]).submit(await manager.getAddress(), data)).wait();
      await expect(multisig.connect(signers[0]).approve(0))
        .to.emit(multisig, "Approved")
        .withArgs(0, signers[0].address);
      await expect(multisig.connect(signers[0]).approve(0)).to.be.revertedWithCustomError(
        multisig,
        "AlreadyApproved"
      );
    });

    it("enforces threshold: one approval is not enough for 2-of-2", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      await (await multisig.connect(signers[0]).submit(await manager.getAddress(), data)).wait();
      await (await multisig.connect(signers[0]).approve(0)).wait();
      await expect(multisig.execute(0)).to.be.revertedWithCustomError(
        multisig,
        "ThresholdNotMet"
      );
      await (await multisig.connect(signers[1]).approve(0)).wait();
      await expect(multisig.execute(0)).to.emit(multisig, "Executed").withArgs(0);
      expect(await manager.electionCounter()).to.equal(1);
    });

    it("2-of-3: any two owners can execute", async function () {
      const { signers } = await loadFixture(fixture);
      const three = await deployAll([signers[0], signers[1], signers[2]], 2);
      const data = three.manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      // submit with owner1, approve with owner1 + owner2 (submitter need not approve)
      await multisigExec(three.multisig, [signers[1], signers[2]], await three.manager.getAddress(), data);
      expect(await three.manager.electionCounter()).to.equal(1);
    });

    it("rejects double execution", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["C1", ["A"]]);
      await multisigExec(multisig, [signers[0], signers[1]], await manager.getAddress(), data);
      await expect(multisig.execute(0)).to.be.revertedWithCustomError(
        multisig,
        "AlreadyExecuted"
      );
      await expect(multisig.connect(signers[0]).approve(0)).to.be.revertedWithCustomError(
        multisig,
        "AlreadyExecuted"
      );
    });

    it("reverts on unknown tx ids", async function () {
      const { signers, multisig } = await loadFixture(fixture);
      await expect(multisig.connect(signers[0]).approve(99)).to.be.revertedWithCustomError(
        multisig,
        "TxNotFound"
      );
      await expect(multisig.execute(99)).to.be.revertedWithCustomError(multisig, "TxNotFound");
    });

    it("reverts when the target call fails", async function () {
      const { signers, multisig, manager } = await loadFixture(fixture);
      // createElection with no candidates always reverts -> execution fails
      const data = manager.interface.encodeFunctionData("createElection", ["C1", []]);
      const txId = await multisig.txCount();
      await (await multisig.connect(signers[0]).submit(await manager.getAddress(), data)).wait();
      await (await multisig.connect(signers[0]).approve(txId)).wait();
      await (await multisig.connect(signers[1]).approve(txId)).wait();
      await expect(multisig.execute(txId)).to.be.revertedWithCustomError(
        multisig,
        "ExecutionFailed"
      );
    });
  });
});
