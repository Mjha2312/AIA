import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import {
  advancePhase,
  createElection,
  deployAll,
  makeVoteProof,
  multisigExec,
  tallyHash,
  voteHash,
} from "./helpers";

describe("ElectionManager", function () {
  async function fixture() {
    const d = await deployAll();
    const electionId = await createElection(d.manager, d.multisig, [d.signers[0], d.signers[1]], "C1", [
      "Alice",
      "Bob",
    ]);
    return { ...d, electionId };
  }

  describe("createElection", function () {
    it("only the multisig can create elections", async function () {
      const { signers, manager } = await loadFixture(fixture);
      await expect(manager.connect(signers[0]).createElection("CX", ["A"])).to.be.revertedWithCustomError(
        manager,
        "OnlyMultiSig"
      );
    });

    it("creates the election in Setup with its own Semaphore group", async function () {
      const { manager, electionId, semaphore } = await loadFixture(fixture);
      const [constituencyId, candidates, phase, registered, voted] =
        await manager.getElection(electionId);
      expect(constituencyId).to.equal("C1");
      expect(candidates).to.deep.equal(["Alice", "Bob"]);
      expect(phase).to.equal(0); // Setup
      expect(registered).to.equal(0);
      expect(voted).to.equal(0);
      expect(await manager.getTally(electionId)).to.deep.equal([0n, 0n]);
      const groupId = await manager.getGroupId(electionId);
      // the election owns a fresh, empty Semaphore group
      expect(await semaphore.getMerkleTreeSize(groupId)).to.equal(0);
    });

    it("emits ElectionCreated and assigns incrementing ids", async function () {
      const { manager, multisig, signers } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["C2", ["X", "Y"]]);
      const tx = await multisigExec(multisig, [signers[0], signers[1]], await manager.getAddress(), data);
      await expect(tx)
        .to.emit(manager, "ElectionCreated")
        .withArgs(1, "C2");
      expect(await manager.electionCounter()).to.equal(2);
    });

    it("reverts with no candidates", async function () {
      const { manager, multisig, signers } = await loadFixture(fixture);
      const data = manager.interface.encodeFunctionData("createElection", ["CX", []]);
      await expect(
        multisigExec(multisig, [signers[0], signers[1]], await manager.getAddress(), data)
      ).to.be.reverted;
    });

    it("reverts on unknown elections", async function () {
      const { manager } = await loadFixture(fixture);
      await expect(manager.getElection(99)).to.be.revertedWithCustomError(
        manager,
        "ElectionNotFound"
      );
      await expect(manager.getTally(99)).to.be.revertedWithCustomError(
        manager,
        "ElectionNotFound"
      );
      await expect(manager.getGroupId(99)).to.be.revertedWithCustomError(
        manager,
        "ElectionNotFound"
      );
    });
  });

  describe("advancePhase", function () {
    it("only the multisig can advance, exactly one phase at a time", async function () {
      const { signers, manager, multisig, electionId } = await loadFixture(fixture);
      await expect(manager.connect(signers[0]).advancePhase(electionId)).to.be.revertedWithCustomError(
        manager,
        "OnlyMultiSig"
      );
      // Setup -> Registration
      const tx = await advancePhase(manager, multisig, [signers[0], signers[1]], electionId);
      await expect(tx).to.emit(manager, "PhaseChanged").withArgs(electionId, 1);
      // cannot advance an unknown election
      const data = manager.interface.encodeFunctionData("advancePhase", [99]);
      await expect(
        multisigExec(multisig, [signers[0], signers[1]], await manager.getAddress(), data)
      ).to.be.reverted;
    });

    it("walks the full lifecycle and seals the tally on finalize", async function () {
      const { signers, manager, multisig, electionId } = await loadFixture(fixture);
      const owners = [signers[0], signers[1]];
      for (const expected of [1, 2, 3]) {
        const tx = await advancePhase(manager, multisig, owners, electionId);
        await expect(tx).to.emit(manager, "PhaseChanged").withArgs(electionId, expected);
      }
      // Tallying -> Finalized emits the tally hash of the empty tally
      const finalTx = await advancePhase(manager, multisig, owners, electionId);
      await expect(finalTx).to.emit(manager, "PhaseChanged").withArgs(electionId, 4);
      await expect(finalTx)
        .to.emit(manager, "TallyFinalized")
        .withArgs(electionId, tallyHash([0n, 0n]));
      // Finalized is terminal
      const data = manager.interface.encodeFunctionData("advancePhase", [electionId]);
      await expect(
        multisigExec(multisig, owners, await manager.getAddress(), data)
      ).to.be.reverted;
    });
  });

  describe("setRegistrar", function () {
    it("multisig can rotate the registrar exactly once", async function () {
      const { signers, manager, multisig } = await loadFixture(fixture);
      const owners = [signers[0], signers[1]];
      const data = manager.interface.encodeFunctionData("setRegistrar", [signers[2].address]);
      await multisigExec(multisig, owners, await manager.getAddress(), data);
      expect(await manager.registrar()).to.equal(signers[2].address);
      const data2 = manager.interface.encodeFunctionData("setRegistrar", [signers[3].address]);
      await expect(multisigExec(multisig, owners, await manager.getAddress(), data2)).to.be
        .reverted;
      expect(await manager.registrar()).to.equal(signers[2].address);
    });

    it("non-multisig cannot set the registrar", async function () {
      const { signers, manager } = await loadFixture(fixture);
      await expect(
        manager.connect(signers[0]).setRegistrar(signers[2].address)
      ).to.be.revertedWithCustomError(manager, "OnlyMultiSig");
    });

    it("reverts zero-address construction and registrar", async function () {
      const { signers, manager, multisig, semaphore } = await loadFixture(fixture);
      const Manager = await ethers.getContractFactory("ElectionManager");
      const registrar = signers[signers.length - 1].address;
      await expect(
        Manager.deploy(ethers.ZeroAddress, await semaphore.getAddress(), registrar)
      ).to.be.revertedWithCustomError(Manager, "InvalidRegistrar");
      await expect(
        Manager.deploy(await multisig.getAddress(), ethers.ZeroAddress, registrar)
      ).to.be.revertedWithCustomError(Manager, "InvalidRegistrar");
      await expect(
        Manager.deploy(await multisig.getAddress(), await semaphore.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Manager, "InvalidRegistrar");
      const data = manager.interface.encodeFunctionData("setRegistrar", [ethers.ZeroAddress]);
      await expect(
        multisigExec(multisig, [signers[0], signers[1]], await manager.getAddress(), data)
      ).to.be.reverted;
    });
  });

  describe("registerVoter", function () {
    it("only the registrar, only in Registration phase", async function () {
      const { signers, manager, registrar, electionId } = await loadFixture(fixture);
      const commitment = new Identity("voter-1").commitment;
      // Setup phase: rejected even by registrar
      await expect(
        manager.connect(registrar).registerVoter(electionId, commitment)
      ).to.be.revertedWithCustomError(manager, "WrongPhase");
      // non-registrar rejected
      await expect(
        manager.connect(signers[0]).registerVoter(electionId, commitment)
      ).to.be.revertedWithCustomError(manager, "OnlyRegistrar");
    });

    it("registers commitments and emits VoterRegistered", async function () {
      const { manager, multisig, signers, registrar, electionId } = await loadFixture(fixture);
      await advancePhase(manager, multisig, [signers[0], signers[1]], electionId);
      const c1 = new Identity("voter-1").commitment;
      const c2 = new Identity("voter-2").commitment;
      await expect(manager.connect(registrar).registerVoter(electionId, c1))
        .to.emit(manager, "VoterRegistered")
        .withArgs(electionId, c1);
      await (await manager.connect(registrar).registerVoter(electionId, c2)).wait();
      const [, , , registered] = await manager.getElection(electionId);
      expect(registered).to.equal(2);
    });

    it("rejects zero and duplicate commitments", async function () {
      const { manager, multisig, signers, registrar, electionId } = await loadFixture(fixture);
      await advancePhase(manager, multisig, [signers[0], signers[1]], electionId);
      await expect(
        manager.connect(registrar).registerVoter(electionId, 0)
      ).to.be.revertedWithCustomError(manager, "InvalidCommitment");
      const c1 = new Identity("voter-1").commitment;
      await (await manager.connect(registrar).registerVoter(electionId, c1)).wait();
      // Semaphore LeanIMT reverts LeafAlreadyExists on duplicates
      await expect(manager.connect(registrar).registerVoter(electionId, c1)).to.be.reverted;
    });
  });

  describe("castVote (real Semaphore proofs)", function () {
    // Setup=0 -> advance to Registration -> register 2 voters -> advance to Voting.
    async function votingFixture() {
      const d = await deployAll();
      const electionId = await createElection(d.manager, d.multisig, [d.signers[0], d.signers[1]], "C1", [
        "Alice",
        "Bob",
      ]);
      await advancePhase(d.manager, d.multisig, [d.signers[0], d.signers[1]], electionId);
      const identities = [new Identity("voter-1"), new Identity("voter-2")];
      const group = new Group();
      for (const id of identities) {
        await (await d.manager.connect(d.registrar).registerVoter(electionId, id.commitment)).wait();
        group.addMember(id.commitment);
      }
      await advancePhase(d.manager, d.multisig, [d.signers[0], d.signers[1]], electionId);
      return { ...d, electionId, identities, group };
    }

    it("counts a valid vote and emits VoteCast with the correct voteHash", async function () {
      const { manager, electionId, identities, group } = await loadFixture(votingFixture);
      const proof = await makeVoteProof(identities[0], group, 1, electionId);
      const expectedHash = voteHash(electionId, proof.nullifier, 1);
      await expect(manager.castVote(electionId, 1, proof))
        .to.emit(manager, "VoteCast")
        .withArgs(electionId, proof.nullifier, 1, expectedHash);
      expect(await manager.getTally(electionId)).to.deep.equal([0n, 1n]);
      const [, , , , voted] = await manager.getElection(electionId);
      expect(voted).to.equal(1);
    });

    it("rejects a double vote with the same identity", async function () {
      const { manager, electionId, identities, group } = await loadFixture(votingFixture);
      const proof = await makeVoteProof(identities[0], group, 0, electionId);
      await (await manager.castVote(electionId, 0, proof)).wait();
      // same identity, same scope -> same nullifier -> Semaphore reverts
      const proof2 = await makeVoteProof(identities[0], group, 1, electionId);
      await expect(manager.castVote(electionId, 1, proof2)).to.be.reverted;
    });

    it("rejects proofs from a different election (scope mismatch)", async function () {
      const { manager, electionId, identities, group } = await loadFixture(votingFixture);
      const proof = await makeVoteProof(identities[0], group, 0, electionId + 99);
      await expect(
        manager.castVote(electionId, 0, proof)
      ).to.be.revertedWithCustomError(manager, "ScopeMismatch");
    });

    it("rejects message mismatch (proof for another candidate)", async function () {
      const { manager, electionId, identities, group } = await loadFixture(votingFixture);
      const proof = await makeVoteProof(identities[0], group, 1, electionId);
      await expect(
        manager.castVote(electionId, 0, proof)
      ).to.be.revertedWithCustomError(manager, "MessageMismatch");
    });

    it("rejects out-of-range candidate indexes", async function () {
      const { manager, electionId, identities, group } = await loadFixture(votingFixture);
      const proof = await makeVoteProof(identities[0], group, 5, electionId);
      await expect(manager.castVote(electionId, 5, proof)).to.be.revertedWithCustomError(
        manager,
        "InvalidCandidate"
      );
    });

    it("rejects proofs from non-members", async function () {
      const { manager, electionId } = await loadFixture(votingFixture);
      const outsider = new Identity("outsider");
      const outsiderGroup = new Group([outsider.commitment]);
      const proof = await makeVoteProof(outsider, outsiderGroup, 0, electionId);
      // root is not part of the election group -> Semaphore reverts
      await expect(manager.castVote(electionId, 0, proof)).to.be.reverted;
    });

    it("rejects votes outside the Voting phase", async function () {
      const { manager, multisig, signers, registrar } = await loadFixture(fixture);
      const id = await createElection(manager, multisig, [signers[0], signers[1]], "C9", ["A", "B"]);
      await advancePhase(manager, multisig, [signers[0], signers[1]], id); // Registration
      const voter = new Identity("late-voter");
      await (await manager.connect(registrar).registerVoter(id, voter.commitment)).wait();
      const group = new Group([voter.commitment]);
      const proof = await makeVoteProof(voter, group, 0, id);
      // still Registration, not Voting
      await expect(manager.castVote(id, 0, proof)).to.be.revertedWithCustomError(
        manager,
        "WrongPhase"
      );
    });

    it("anyone may relay (non-registrar caller succeeds)", async function () {
      const { signers, manager, electionId, identities, group } = await loadFixture(votingFixture);
      const relayer = signers[5];
      const proof = await makeVoteProof(identities[1], group, 0, electionId);
      await (await manager.connect(relayer).castVote(electionId, 0, proof)).wait();
      expect(await manager.getTally(electionId)).to.deep.equal([1n, 0n]);
    });
  });
});
