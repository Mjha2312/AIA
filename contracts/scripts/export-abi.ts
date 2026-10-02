import { artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/// @notice Export ABIs the backend needs into contracts/abi/*.json.
/// @dev Each file is { contractName, abi }. Semaphore is the full protocol ABI
///   (group admin/member calls for the indexer, validateProof shapes for the relayer).
///   Run with `npm run abi`; generated files are committed.
async function main() {
  const abiDir = path.join(__dirname, "..", "abi");
  fs.mkdirSync(abiDir, { recursive: true });

  for (const name of ["ECIMultiSig", "ElectionManager", "Semaphore"]) {
    const artifact = await artifacts.readArtifact(name);
    const outPath = path.join(abiDir, `${name}.json`);
    fs.writeFileSync(
      outPath,
      JSON.stringify({ contractName: name, abi: artifact.abi }, null, 2) + "\n"
    );
    console.log(`wrote ${outPath} (${artifact.abi.length} entries)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
