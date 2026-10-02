import { InMemoryIndexerStore } from "../src/indexer/store.js";
import { computeVoteHash } from "../src/chain/relay.js";

/**
 * Shared read-model fixture:
 * - "1" Ward 12 [Alice,Bob], Voting(2), 4 members, 3 votes [0,0,1].
 * - "2" Ward 9 [X,Y], Finalized(4), 1 member, 1 vote [1].
 * - "3" New Town [P], Setup(0), empty (covers zero-division turnout).
 */
export async function seedReadModel(store: InMemoryIndexerStore): Promise<void> {
  const ts = (n: number): Date => new Date(`2026-01-01T00:00:${String(n).padStart(2, "0")}Z`);

  await store.ensureElection("1", "Ward 12");
  await store.setElectionDetails("1", { constituencyId: "Ward 12", candidates: ["Alice", "Bob"] });
  await store.setPhase("1", 2);
  for (const commitment of ["1001", "1002", "1003", "1004"]) {
    const leafIndex = await store.memberCount("1");
    await store.addMember({
      electionId: "1",
      identityCommitment: commitment,
      leafIndex,
      txHash: `0xreg${commitment}`,
      logIndex: 0,
      blockNumber: 5,
    });
    await store.bumpRegistered("1");
  }
  const votes1: Array<{ nullifier: string; candidate: number; block: number; tx: string }> = [
    { nullifier: "5001", candidate: 0, block: 10, tx: "0xvote1" },
    { nullifier: "5002", candidate: 0, block: 11, tx: "0xvote2" },
    { nullifier: "5003", candidate: 1, block: 12, tx: "0xvote3" },
  ];
  for (const v of votes1) {
    await store.addVote({
      voteHash: computeVoteHash("1", v.nullifier, String(v.candidate)),
      electionId: "1",
      nullifier: v.nullifier,
      candidateIndex: v.candidate,
      txHash: v.tx,
      logIndex: 0,
      blockNumber: v.block,
      blockTimestamp: ts(v.block),
    });
    await store.bumpVoted("1");
  }

  await store.ensureElection("2", "Ward 9");
  await store.setElectionDetails("2", { constituencyId: "Ward 9", candidates: ["X", "Y"] });
  await store.setPhase("2", 4);
  await store.addMember({
    electionId: "2",
    identityCommitment: "2001",
    leafIndex: 0,
    txHash: "0xreg2001",
    logIndex: 0,
    blockNumber: 15,
  });
  await store.bumpRegistered("2");
  await store.addVote({
    voteHash: computeVoteHash("2", "6001", "1"),
    electionId: "2",
    nullifier: "6001",
    candidateIndex: 1,
    txHash: "0xvote4",
    logIndex: 0,
    blockNumber: 20,
    blockTimestamp: ts(20),
  });
  await store.bumpVoted("2");

  await store.ensureElection("3", "New Town");
  await store.setElectionDetails("3", { constituencyId: "New Town", candidates: ["P"] });
  await store.setPhase("3", 0);
}
