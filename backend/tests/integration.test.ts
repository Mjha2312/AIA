import { describe, it, expect } from "vitest";
// Skip notices below are intentional console output for this file only.
/* eslint-disable no-console */
import request from "supertest";
import { Contract, HDNodeWallet, Interface, JsonRpcProvider, Mnemonic, parseEther, Wallet, type AbstractSigner, type InterfaceAbi } from "ethers";
import { buildTestApp } from "./helpers.js";
import { createApp } from "../src/app.js";
import { EthersRelayer, computeVoteHash } from "../src/chain/relay.js";
import { loadDeployment } from "../src/chain/artifacts.js";
import { promises as fs } from "node:fs";
import path from "node:path";

// Repo root relative to the backend package dir (vitest runs with cwd=backend).
const REPO_ROOT = path.resolve(process.cwd(), "..");

const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const ELECTION_TIMEOUT = 180000;

async function loadAbi(name: "ECIMultiSig" | "ElectionManager"): Promise<Interface> {
  const p = `${REPO_ROOT}/contracts/abi/${name}.json`;
  const raw = JSON.parse(await fs.readFile(p, "utf8")) as { abi: InterfaceAbi };
  return new Interface(raw.abi);
}

async function rpcAvailable(rpcUrl: string, expectedChainId: number): Promise<JsonRpcProvider | null> {
  try {
    const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("rpc timeout")), 5000)),
    ]);
    if (Number(network.chainId) !== expectedChainId) {
      await provider.destroy();
      return null;
    }
    return provider;
  } catch {
    return null;
  }
}

describe("relay integration (local Hardhat node)", () => {
  it(
    "relays a real Semaphore vote end-to-end",
    async () => {
      const rpcUrl = process.env.RPC_URL ?? "http://localhost:8545";
      const deployment = await loadDeployment().catch(() => null);
      if (!deployment?.ElectionManager || !deployment?.ECIMultiSig) {
        console.info("integration: no deployment file — skipping");
        return;
      }
      const provider = await rpcAvailable(rpcUrl, deployment.chainId ?? 31337);
      if (!provider) {
        console.info("integration: no local Hardhat node — skipping");
        return;
      }
      try {
        await runAgainstNode(rpcUrl, provider, deployment as { ECIMultiSig: string; ElectionManager: string });
      } finally {
        await provider.destroy();
      }
    },
    ELECTION_TIMEOUT,
  );
});

async function runAgainstNode(
  rpcUrl: string,
  provider: JsonRpcProvider,
  deployment: { ECIMultiSig: string; ElectionManager: string },
): Promise<void> {
  const managerIface = await loadAbi("ElectionManager");
  const multisigIface = await loadAbi("ECIMultiSig");

  const mnemonic = Mnemonic.fromPhrase(HARDHAT_MNEMONIC);
  const signers = Array.from({ length: 6 }, (_, i) =>
    HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${i}`).connect(provider),
  );
  // Minimal typed view over the multisig (avoids pulling typechain in).
  type Multisig = Contract & {
    threshold(): Promise<bigint>;
    isOwner(addr: string): Promise<boolean>;
    txCount(): Promise<bigint>;
  };
  const multisig = new Contract(deployment.ECIMultiSig, multisigIface, signers[0]) as Multisig;
  const manager = new Contract(deployment.ElectionManager, managerIface, signers[0]);

  const threshold = Number(await multisig.threshold());
  const owners: HDNodeWallet[] = [];
  for (const s of signers) {
    if (owners.length >= threshold) break;
    if (await multisig.isOwner(s.address)) owners.push(s);
  }
  if (owners.length < threshold) {
    console.info("integration: multisig owners are not local accounts — skipping");
    return;
  }

  const registrarAddr = (await manager.getFunction("registrar")()) as string;
  let registrar: AbstractSigner | undefined = signers.find(
    (s) => s.address.toLowerCase() === registrarAddr.toLowerCase(),
  );
  if (!registrar && process.env.REGISTRAR_PRIVATE_KEY) {
    registrar = new Wallet(process.env.REGISTRAR_PRIVATE_KEY, provider);
  }
  if (!registrar) {
    console.info("integration: registrar key unavailable — skipping");
    return;
  }

  // Fund a fresh wallet for the backend relayer under test.
  const relayerKey = Wallet.createRandom().privateKey;
  const relayerAddr = new Wallet(relayerKey).address;
  await (await signers[0].sendTransaction({ to: relayerAddr, value: parseEther("1") })).wait();

  const multisigExec = async (target: string, data: string): Promise<void> => {
    const txId = await multisig.txCount();
    const asSubmitter = multisig.connect(owners[0]) as Multisig;
    await (await asSubmitter.getFunction("submit")(target, data)).wait();
    for (let i = 0; i < threshold; i++) {
      const asApprover = multisig.connect(owners[i]) as Multisig;
      await (await asApprover.getFunction("approve")(txId)).wait();
    }
    await (await asSubmitter.getFunction("execute")(txId)).wait();
  };

  const managerAddr = deployment.ElectionManager;
  await multisigExec(
    managerAddr,
    managerIface.encodeFunctionData("createElection", ["Integration Ward", ["Alice", "Bob"]]),
  );
  const electionId = (Number(await manager.getFunction("electionCounter")()) - 1).toString();
  const advance = (id: string): Promise<void> =>
    multisigExec(managerAddr, managerIface.encodeFunctionData("advancePhase", [id]));
  await advance(electionId); // -> Registration

  const { Identity } = await import("@semaphore-protocol/identity");
  const { Group } = await import("@semaphore-protocol/group");
  const identity = new Identity("backend-integration/voter-0");
  const asRegistrar = manager.connect(registrar);
  await (await asRegistrar.getFunction("registerVoter")(electionId, identity.commitment)).wait();
  await advance(electionId); // -> Voting

  const group = new Group();
  group.addMember(identity.commitment);
  let proofJson: {
    merkleTreeDepth: string;
    merkleTreeRoot: string;
    nullifier: string;
    message: string;
    scope: string;
    points: string[];
  };
  try {
    const { generateProof } = await import("@semaphore-protocol/proof");
    const raw = await generateProof(identity, group, 0, electionId);
    proofJson = {
      merkleTreeDepth: String(raw.merkleTreeDepth),
      merkleTreeRoot: String(raw.merkleTreeRoot),
      nullifier: String(raw.nullifier),
      message: String(raw.message),
      scope: String(raw.scope),
      points: raw.points.map((p: string | bigint) => String(p)),
    };
  } catch (err) {
    console.info(`integration: proof generation unavailable — skipping (${(err as Error).message})`);
    return;
  }

  const { ctx } = buildTestApp();
  const live = await EthersRelayer.fromEnv({
    rpcUrl,
    relayerKey,
    chainId: Number((await provider.getNetwork()).chainId),
    txTimeoutMs: 60000,
  });
  const app = createApp({ ...ctx, relayer: live });

  const first = await request(app)
    .post("/api/relay/vote")
    .send({ electionId, candidateIndex: 0, proof: proofJson });
  expect(first.status).toBe(200);
  expect(first.body.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  expect(first.body.voteHash).toBe(computeVoteHash(electionId, proofJson.nullifier, "0"));

  // Same nullifier again: the real Semaphore double-vote revert maps to 409.
  const replay = await request(app)
    .post("/api/relay/vote")
    .send({ electionId, candidateIndex: 0, proof: proofJson });
  expect(replay.status).toBe(409);
  expect(replay.body.error.code).toBe("ALREADY_VOTED");
}
