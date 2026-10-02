import { expect } from "chai";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import {
  advancePhase,
  createElection,
  deployAll,
  makeVoteProof,
  tallyHash,
} from "./helpers";

/// @notice Full lifecycle: 2-of-3 multisig, 5 voters, 2 candidates, 3-2 split.
describe("AIA Vote end-to-end", function () {
  it("runs setup -> registration -> voting -> tallying -> finalized", async function () {
    const signers = (await deployAll()).signers;
    const owners = [signers[0], signers[1], signers[2]];
    // 2-of-3 multisig
    const { manager, multisig, registrar } = await deployAll(owners, 2);

    const electionId = await createElection(manager, multisig, [owners[0], owners[1]], "KA-BLR-SOUTH", [
      "Alice",
      "Bob",
    ]);
    expect(electionId).to.equal(0);

    await advancePhase(manager, multisig, [owners[0], owners[1]], electionId); // Registration

    const identities = ["a", "b", "c", "d", "e"].map((s) => new Identity(`e2e-${s}`));
    const group = new Group();
    for (const id of identities) {
      await (await manager.connect(registrar).registerVoter(electionId, id.commitment)).wait();
      group.addMember(id.commitment);
    }
    const [, , phase1, registered] = await manager.getElection(electionId);
    expect(phase1).to.equal(1);
    expect(registered).to.equal(5);

    await advancePhase(manager, multisig, [owners[1], owners[2]], electionId); // Voting

    // 3 votes for Alice (0), 2 for Bob (1) — different owners relay, any caller works
    const votes: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
    ];
    for (const [voterIdx, candidate] of votes) {
      const proof = await makeVoteProof(identities[voterIdx], group, candidate, electionId);
      await (await manager.castVote(electionId, candidate, proof)).wait();
    }
    expect(await manager.getTally(electionId)).to.deep.equal([3n, 2n]);
    const [, , , , voted] = await manager.getElection(electionId);
    expect(voted).to.equal(5);

    await advancePhase(manager, multisig, [owners[0], owners[2]], electionId); // Tallying
    expect(await manager.getTally(electionId)).to.deep.equal([3n, 2n]);

    const finalTx = await advancePhase(manager, multisig, [owners[0], owners[1]], electionId);
    await expect(finalTx)
      .to.emit(manager, "TallyFinalized")
      .withArgs(electionId, tallyHash([3n, 2n]));

    const [, , phaseFinal, registeredFinal, votedFinal] = await manager.getElection(electionId);
    expect(phaseFinal).to.equal(4);
    expect(registeredFinal).to.equal(5);
    expect(votedFinal).to.equal(5);
  });
});
