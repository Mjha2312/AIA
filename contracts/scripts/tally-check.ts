import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { ElectionManager__factory } from "../typechain-types";

/// @notice Public-verifiability demo: recompute an election's tally from its
///   on-chain VoteCast events and compare with getTally().
/// @dev Run: `npm run tally:check -- 0` (election id optional; default: all).
///   Also honors ELECTION_ID env. Reads only — no transactions, no secrets.
///   Prints MATCH when every candidate count agrees, MISMATCH otherwise.
///   As a bonus each event's voteHash is recomputed as
///   keccak256(abi.encode(electionId, nullifier, candidateIndex)) and checked.
///   Exit code 0 iff every checked election matches.

async function main() {
  const depPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(depPath)) {
    throw new Error(`no deployment at ${depPath} — run the deploy script first`);
  }
  const deployment = JSON.parse(fs.readFileSync(depPath, "utf8")) as {
    ElectionManager: string;
    chainId: number;
  };

  const manager = ElectionManager__factory.connect(
    deployment.ElectionManager,
    (await ethers.getSigners())[0]
  );

  const counter = Number(await manager.electionCounter());
  if (counter === 0) {
    console.log("no elections on-chain yet");
    return;
  }

  const rawArg = process.env.ELECTION_ID ?? process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const ids =
    rawArg !== undefined ? [Number(rawArg)] : Array.from({ length: counter }, (_, i) => i);
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0 || id >= counter) {
      throw new Error(`election ${rawArg} out of range (0..${counter - 1})`);
    }
  }

  let allMatch = true;
  for (const electionId of ids) {
    const [, candidates, phase, registered, voted] = await manager.getElection(electionId);
    const onChain = (await manager.getTally(electionId)).map((t) => Number(t));

    const filter = manager.filters.VoteCast(electionId);
    const events = await manager.queryFilter(filter);

    const recomputed = new Array<number>(candidates.length).fill(0);
    let badHashes = 0;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    for (const ev of events) {
      const args = (ev as unknown as { args: unknown }).args as {
        nullifier: bigint;
        candidateIndex: bigint;
        voteHash: string;
      };
      const candidateIndex = Number(args.candidateIndex);
      if (candidateIndex < 0 || candidateIndex >= candidates.length) {
        badHashes += 1;
        continue;
      }
      recomputed[candidateIndex] += 1;
      const expected = ethers.keccak256(
        coder.encode(["uint256", "uint256", "uint256"], [electionId, args.nullifier, candidateIndex])
      );
      if (expected !== args.voteHash) badHashes += 1;
    }

    const tallyMatch =
      onChain.length === recomputed.length &&
      onChain.every((v, i) => v === recomputed[i]);
    const countMatch = events.length === Number(voted) && badHashes === 0;
    const match = tallyMatch && countMatch;
    allMatch = allMatch && match;

    console.log(`\nelection ${electionId} (phase ${phase}, registered ${registered}, voted ${voted})`);
    console.log(`  VoteCast events : ${events.length}`);
    console.log(`  on-chain tally  : [${onChain.join(", ")}]`);
    console.log(`  recomputed      : [${recomputed.join(", ")}]`);
    console.log(`  voteHash errors : ${badHashes}`);
    console.log(match ? "  => MATCH" : "  => MISMATCH");
  }

  if (!allMatch) {
    throw new Error("one or more elections MISMATCHed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
