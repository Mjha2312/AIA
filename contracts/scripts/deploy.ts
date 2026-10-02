import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { ECIMultiSig__factory, ElectionManager__factory } from "../typechain-types";
import { Semaphore__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/Semaphore__factory";
import { SemaphoreVerifier__factory } from "../typechain-types/factories/@semaphore-protocol/contracts/base/SemaphoreVerifier__factory";
import { PoseidonT3__factory } from "../typechain-types/factories/poseidon-solidity/PoseidonT3__factory";

/// @notice Deploy the full AIA Vote stack and record it for the backend.
/// @dev Env (all optional on localhost):
///   MULTISIG_OWNERS     comma-separated addresses (default: first 3 local accounts)
///   MULTISIG_THRESHOLD  number (default: 2)
///   REGISTRAR_ADDRESS   backend wallet address (default: REGISTRAR_PRIVATE_KEY's
///                       address, else 4th local account, else the deployer)
///   REGISTRAR_PRIVATE_KEY backend wallet key (address derived if REGISTRAR_ADDRESS unset)
/// Writes contracts/deployments/<network>.json exactly per docs/SPEC.md:
/// { ECIMultiSig, ElectionManager, Semaphore, chainId }.
async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  const owners = (process.env.MULTISIG_OWNERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (owners.length === 0) {
    for (const s of signers.slice(0, 3)) owners.push(s.address);
  }
  const threshold = parseInt(process.env.MULTISIG_THRESHOLD ?? "2", 10);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) {
    throw new Error(`MULTISIG_THRESHOLD must be within 1..${owners.length}`);
  }

  let registrar: string | undefined = process.env.REGISTRAR_ADDRESS?.trim() || undefined;
  if (!registrar && process.env.REGISTRAR_PRIVATE_KEY) {
    registrar = new ethers.Wallet(process.env.REGISTRAR_PRIVATE_KEY).address;
  }
  if (!registrar) {
    registrar = signers[3]?.address ?? deployer.address;
  }

  console.log(`network:   ${network.name}`);
  console.log(`owners:    ${owners.join(", ")} (threshold ${threshold})`);
  console.log(`registrar: ${registrar}`);

  const verifier = await new SemaphoreVerifier__factory(deployer).deploy();
  await verifier.waitForDeployment();
  console.log(`SemaphoreVerifier: ${await verifier.getAddress()}`);

  const poseidon = await new PoseidonT3__factory(deployer).deploy();
  await poseidon.waitForDeployment();

  const semaphore = await new Semaphore__factory(
    { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
    deployer
  ).deploy(await verifier.getAddress());
  await semaphore.waitForDeployment();
  const semaphoreAddr = await semaphore.getAddress();
  console.log(`Semaphore:         ${semaphoreAddr}`);

  const multisig = await new ECIMultiSig__factory(deployer).deploy(owners, threshold);
  await multisig.waitForDeployment();
  const multisigAddr = await multisig.getAddress();
  console.log(`ECIMultiSig:       ${multisigAddr}`);

  const manager = await new ElectionManager__factory(deployer).deploy(
    multisigAddr,
    semaphoreAddr,
    registrar
  );
  await manager.waitForDeployment();
  const managerAddr = await manager.getAddress();
  console.log(`ElectionManager:   ${managerAddr}`);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        ECIMultiSig: multisigAddr,
        ElectionManager: managerAddr,
        Semaphore: semaphoreAddr,
        chainId,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
