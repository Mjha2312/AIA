import { promises as fs } from "node:fs";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { logger } from "../logger.js";
import { artifactPaths, fileExists, loadDeployment } from "./artifacts.js";

export interface Registrar {
  registerVoter(electionId: string, identityCommitment: string): Promise<{ txHash: string }>;
}

/** In-memory fake: lets the API and tests run without a chain. */
export class FakeRegistrar implements Registrar {
  public calls: Array<{ electionId: string; identityCommitment: string }> = [];
  public failNextWith: Error | null = null;

  async registerVoter(
    electionId: string,
    identityCommitment: string,
  ): Promise<{ txHash: string }> {
    this.calls.push({ electionId, identityCommitment });
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
    const n = this.calls.length;
    return { txHash: `0xfake${n.toString(16).padStart(8, "0")}` };
  }
}

/** Live registrar: calls ElectionManager.registerVoter via REGISTRAR_PRIVATE_KEY. */
export class EthersRegistrar implements Registrar {
  private contract: Contract;

  constructor(contract: Contract) {
    this.contract = contract;
  }

  static async fromEnv(opts: {
    rpcUrl: string;
    registrarKey: string;
    chainId: number;
  }): Promise<EthersRegistrar> {
    const { managerAbiPath } = artifactPaths();
    const [abiRaw, deployment] = await Promise.all([
      fs.readFile(managerAbiPath, "utf8"),
      loadDeployment(),
    ]);
    const abiJson = JSON.parse(abiRaw) as { abi: ConstructorParameters<typeof Contract>[1] };
    if (!deployment.ElectionManager) throw new Error("ElectionManager address missing in deployment file");
    const provider = new JsonRpcProvider(opts.rpcUrl, opts.chainId);
    const wallet = new Wallet(opts.registrarKey, provider);
    const contract = new Contract(deployment.ElectionManager, abiJson.abi, wallet);
    return new EthersRegistrar(contract);
  }

  async registerVoter(
    electionId: string,
    identityCommitment: string,
  ): Promise<{ txHash: string }> {
    const tx = await (this.contract.registerVoter as (a: string, b: string) => Promise<{ hash: string; wait: () => Promise<unknown> }>)(
      electionId,
      identityCommitment,
    );
    await tx.wait();
    return { txHash: tx.hash };
  }
}

export async function selectRegistrar(opts: {
  chainMode: "auto" | "fake" | "live";
  rpcUrl: string;
  registrarKey: string;
  chainId: number;
}): Promise<Registrar> {
  if (opts.chainMode === "fake") {
    logger.info("Using FakeRegistrar (CHAIN_MODE=fake)");
    return new FakeRegistrar();
  }
  if (opts.chainMode === "live") {
    return EthersRegistrar.fromEnv(opts);
  }
  // auto: use live registrar when contract artifacts are present, else fake.
  const { managerAbiPath, deploymentPath } = artifactPaths();
  if ((await fileExists(managerAbiPath)) && (await fileExists(deploymentPath))) {
    try {
      const registrar = await EthersRegistrar.fromEnv(opts);
      logger.info("Using EthersRegistrar (contract artifacts found)");
      return registrar;
    } catch (err) {
      logger.warn({ err }, "Falling back to FakeRegistrar: live registrar init failed");
      return new FakeRegistrar();
    }
  }
  logger.info("Using FakeRegistrar (no contract artifacts found)");
  return new FakeRegistrar();
}
