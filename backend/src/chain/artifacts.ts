import { promises as fs } from "node:fs";
import path from "node:path";
import { Interface, type InterfaceAbi } from "ethers";
import { backendRootDir } from "../paths.js";

/** Locates the chain dev's artifacts (read-only from backend's perspective). */
export function artifactPaths(): { managerAbiPath: string; semaphoreAbiPath: string; deploymentPath: string } {
  const repoRoot = path.resolve(backendRootDir(), "..");
  return {
    managerAbiPath: path.join(repoRoot, "contracts", "abi", "ElectionManager.json"),
    semaphoreAbiPath: path.join(repoRoot, "contracts", "abi", "Semaphore.json"),
    deploymentPath: path.join(repoRoot, "contracts", "deployments", "localhost.json"),
  };
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface DeploymentRefs {
  ECIMultiSig?: string;
  ElectionManager?: string;
  Semaphore?: string;
  chainId?: number;
}

export async function loadDeployment(): Promise<DeploymentRefs> {
  const { deploymentPath } = artifactPaths();
  const raw = await fs.readFile(deploymentPath, "utf8");
  return JSON.parse(raw) as DeploymentRefs;
}

async function loadAbiFragment(abiPath: string): Promise<InterfaceAbi> {
  const raw = await fs.readFile(abiPath, "utf8");
  const parsed = JSON.parse(raw) as { abi: InterfaceAbi };
  return parsed.abi;
}

/** ElectionManager interface (functions + custom errors + events). */
export async function loadManagerInterface(): Promise<Interface> {
  const { managerAbiPath } = artifactPaths();
  return new Interface(await loadAbiFragment(managerAbiPath));
}

/**
 * Combined interface for revert decoding: ElectionManager plus Semaphore
 * custom errors (double-vote / invalid-proof reverts come from Semaphore).
 */
export async function loadRelayDecodeInterface(): Promise<Interface> {
  const { managerAbiPath, semaphoreAbiPath } = artifactPaths();
  const [managerAbi, semaphoreAbi] = await Promise.all([
    loadAbiFragment(managerAbiPath),
    loadAbiFragment(semaphoreAbiPath),
  ]);
  const semaphoreErrors = (Array.isArray(semaphoreAbi) ? semaphoreAbi : []).filter(
    (f) => (f as { type?: string }).type === "error",
  );
  const combined = [...(managerAbi as unknown[]), ...semaphoreErrors];
  return new Interface(combined as InterfaceAbi);
}
