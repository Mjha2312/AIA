import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { ECIMultiSig__factory, ElectionManager__factory } from "../typechain-types";
import type { Wallet } from "ethers";
import type { ECIMultiSig, ElectionManager } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/// @notice Seed 3 demo elections against a running node with deployments done.
/// @dev Run: `npm run seed:demo` (== hardhat run scripts/seed-demo.ts --network localhost).
///   Every admin step goes through the multisig submit -> approve -> execute flow.
///   Re-runnable: each run creates 3 FRESH elections (counter keeps increasing)
///   and overwrites contracts/.demo/identities.json.
///   Identities are deterministic mock seeds (`aia-vote-demo/...`) — dev-only,
///   never real voters. The identities file holds PRIVATE key material and is
///   gitignored; share it with frontend/backend devs out-of-band only.
///
///   Plan:
///     A "Kolkata Dakshin (Lok Sabha)"  4 candidates, left in Registration.
///     B "Ward 12 Municipal Corporation" 3 candidates, 20 registered, 8 voted,
///       left in Voting (tally [3,3,2]).
///     C "Gram Panchayat Demo"           2 candidates, 10 registered, 10 voted
///       (tally [6,4]), advanced to Finalized.

const PHASE_NAMES = ["Setup", "Registration", "Voting", "Tallying", "Finalized"];

interface DemoVoter {
  electionId: number;
  constituencyId: string;
  voterIndex: number;
  /// @dev PRIVATE: Identity.import(export) restores the full identity.
  identityExport: string;
  commitment: string;
  voted: boolean;
  candidateIndex: number | null;
}

async function multisigExec(
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  threshold: number,
  target: string,
  data: string
): Promise<void> {
  const txId = await multisig.txCount();
  await (await multisig.connect(approvers[0]).submit(target, data)).wait();
  for (let i = 0; i < threshold; i++) {
    await (await multisig.connect(approvers[i]).approve(txId)).wait();
  }
  await (await multisig.connect(approvers[0]).execute(txId)).wait();
}

async function createElection(
  manager: ElectionManager,
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  threshold: number,
  constituencyId: string,
  candidates: string[]
): Promise<number> {
  const data = manager.interface.encodeFunctionData("createElection", [
    constituencyId,
    candidates,
  ]);
  await multisigExec(multisig, approvers, threshold, await manager.getAddress(), data);
  return Number(await manager.electionCounter()) - 1;
}

async function advancePhase(
  manager: ElectionManager,
  multisig: ECIMultiSig,
  approvers: HardhatEthersSigner[],
  threshold: number,
  electionId: number
): Promise<void> {
  const data = manager.interface.encodeFunctionData("advancePhase", [electionId]);
  await multisigExec(multisig, approvers, threshold, await manager.getAddress(), data);
}

async function main() {
  const depPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(depPath)) {
    throw new Error(`no deployment at ${depPath} — run the deploy script first`);
  }
  const deployment = JSON.parse(fs.readFileSync(depPath, "utf8")) as {
    ECIMultiSig: string;
    ElectionManager: string;
    chainId: number;
  };

  const signers = await ethers.getSigners();
  const multisig = ECIMultiSig__factory.connect(deployment.ECIMultiSig, signers[0]);
  const manager = ElectionManager__factory.connect(deployment.ElectionManager, signers[0]);

  // Multisig owners: whoever is flagged isOwner among local signers.
  const threshold = Number(await multisig.threshold());
  const owners = [] as HardhatEthersSigner[];
  for (const s of signers) {
    if (await multisig.isOwner(s.address)) owners.push(s);
    if (owners.length >= threshold) break;
  }
  if (owners.length < threshold) {
    throw new Error(
      `need ${threshold} owner signer(s), found ${owners.length} — check MULTISIG_OWNERS / local accounts`
    );
  }

  // Registrar: local signer matching manager.registrar(), else env key.
  const registrarAddr = await manager.registrar();
  let registrar: HardhatEthersSigner | Wallet = signers.find(
    (s) => s.address.toLowerCase() === registrarAddr.toLowerCase()
  ) as HardhatEthersSigner;
  if (!registrar) {
    if (!process.env.REGISTRAR_PRIVATE_KEY) {
      throw new Error(
        `registrar ${registrarAddr} is not a local signer — set REGISTRAR_PRIVATE_KEY`
      );
    }
    registrar = new ethers.Wallet(process.env.REGISTRAR_PRIVATE_KEY, ethers.provider);
  }
  console.log(`network:   ${network.name} (chainId ${deployment.chainId})`);
  console.log(`multisig:  ${deployment.ECIMultiSig} (threshold ${threshold})`);
  console.log(`manager:   ${deployment.ElectionManager}`);
  console.log(`registrar: ${registrarAddr}`);

  const demoVoters: DemoVoter[] = [];
  const summary: Array<{
    id: number;
    constituency: string;
    candidates: string;
    phase: string;
    registered: string;
    voted: string;
    tally: string;
  }> = [];

  async function seedElection(opts: {
    slot: string;
    constituencyId: string;
    candidates: string[];
    voterCount: number;
    votes: number[]; // candidateIndex per voter index (prefix of voters)
    finalAdvances: number; // phase advances after creation (1=Registration, 2=Voting, 4=Finalized)
  }): Promise<number> {
    const electionId = await createElection(
      manager,
      multisig,
      owners,
      threshold,
      opts.constituencyId,
      opts.candidates
    );
    console.log(`\ncreated election ${electionId}: "${opts.constituencyId}"`);

    // Setup -> Registration.
    await advancePhase(manager, multisig, owners, threshold, electionId);

    // Register mock voters (deterministic dev-only identities).
    const group = new Group();
    const identities: Identity[] = [];
    for (let i = 0; i < opts.voterCount; i++) {
      const identity = new Identity(`aia-vote-demo/${opts.slot}/voter-${i}`);
      identities.push(identity);
      await (
        await manager.connect(registrar).registerVoter(electionId, identity.commitment)
      ).wait();
      group.addMember(identity.commitment);
      demoVoters.push({
        electionId,
        constituencyId: opts.constituencyId,
        voterIndex: i,
        identityExport: identity.export(),
        commitment: identity.commitment.toString(),
        voted: false,
        candidateIndex: null,
      });
    }
    if (opts.voterCount > 0) console.log(`  registered ${opts.voterCount} mock voters`);

    // Registration -> Voting, then cast the planned votes.
    if (opts.finalAdvances >= 2) {
      await advancePhase(manager, multisig, owners, threshold, electionId);
      for (let i = 0; i < opts.votes.length; i++) {
        const candidate = opts.votes[i];
        const raw = await generateProof(identities[i], group, candidate, electionId);
        const proof = {
          merkleTreeDepth: BigInt(raw.merkleTreeDepth),
          merkleTreeRoot: BigInt(raw.merkleTreeRoot),
          nullifier: BigInt(raw.nullifier),
          message: BigInt(raw.message),
          scope: BigInt(raw.scope),
          points: raw.points.map((p: string | bigint) => BigInt(p)),
        };
        await (await manager.castVote(electionId, candidate, proof)).wait();
        const rec = demoVoters.find(
          (v) => v.electionId === electionId && v.voterIndex === i
        );
        if (rec) {
          rec.voted = true;
          rec.candidateIndex = candidate;
        }
      }
      if (opts.votes.length > 0) console.log(`  cast ${opts.votes.length} votes`);
    }

    // Voting -> Tallying -> Finalized (as requested).
    for (let a = 2; a < opts.finalAdvances; a++) {
      await advancePhase(manager, multisig, owners, threshold, electionId);
    }

    const [constituencyId, candidates, phase, registered, voted] =
      await manager.getElection(electionId);
    const tally = (await manager.getTally(electionId)).map((t) => t.toString());
    void constituencyId;
    void candidates;
    summary.push({
      id: electionId,
      constituency: opts.constituencyId,
      candidates: String(opts.candidates.length),
      phase: PHASE_NAMES[Number(phase)],
      registered: registered.toString(),
      voted: voted.toString(),
      tally: `[${tally.join(", ")}]`,
    });
    return electionId;
  }

  await seedElection({
    slot: "kolkata-dakshin",
    constituencyId: "Kolkata Dakshin (Lok Sabha)",
    candidates: ["Candidate A", "Candidate B", "Candidate C", "Candidate D"],
    voterCount: 0,
    votes: [],
    finalAdvances: 1, // left in Registration
  });

  await seedElection({
    slot: "ward-12",
    constituencyId: "Ward 12 Municipal Corporation",
    candidates: ["Candidate A", "Candidate B", "Candidate C"],
    voterCount: 20,
    votes: [0, 0, 0, 1, 1, 1, 2, 2], // tally [3,3,2]
    finalAdvances: 2, // left in Voting
  });

  await seedElection({
    slot: "gram-panchayat",
    constituencyId: "Gram Panchayat Demo",
    candidates: ["Candidate A", "Candidate B"],
    voterCount: 10,
    votes: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // tally [6,4], everyone voted
    finalAdvances: 4, // Finalized
  });

  // Private identities for frontend/backend devs (gitignored).
  const demoDir = path.join(__dirname, "..", ".demo");
  fs.mkdirSync(demoDir, { recursive: true });
  const idsPath = path.join(demoDir, "identities.json");
  fs.writeFileSync(
    idsPath,
    JSON.stringify(
      {
        warning:
          "DEV-ONLY mock identities (deterministic seeds). Private key material — never commit, never use in production.",
        network: network.name,
        chainId: deployment.chainId,
        generatedAt: new Date().toISOString(),
        voters: demoVoters,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\nwrote ${demoVoters.length} demo identities -> ${idsPath} (gitignored)`);

  console.log("\n=== demo elections ===");
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
