import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";

/// @notice Env-driven RPC endpoints / keys. Empty values keep the entry
///   defined but unusable until env is provided — scripts fail with a clear
///   message instead of silently pointing at the wrong chain.
/// @dev AMOY_* for the Polygon Amoy testnet path (`npm run deploy:amoy`);
///   BESU_* for a local Hyperledger Besu dev node, see contracts/BESU.md
///   (optional, prototype only). Never commit real keys; use .env (gitignored).
const AMOY_RPC_URL = process.env.AMOY_RPC_URL ?? "";
const AMOY_DEPLOYER_KEY = process.env.AMOY_DEPLOYER_KEY ?? "";
const BESU_RPC_URL = process.env.BESU_RPC_URL ?? "http://127.0.0.1:8545";
const BESU_PRIVATE_KEY = process.env.BESU_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: "0.8.23",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: AMOY_DEPLOYER_KEY ? [AMOY_DEPLOYER_KEY] : [],
    },
    besu: {
      url: BESU_RPC_URL,
      accounts: BESU_PRIVATE_KEY ? [BESU_PRIVATE_KEY] : [],
    },
  },
};

export default config;
