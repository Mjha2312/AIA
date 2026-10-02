import { mock } from 'wagmi/connectors';
import type { Address } from 'viem';

import { CHAIN_ID, RPC_URL } from './env';

/**
 * Demo-only wallet: Hardhat's well-known first test account
 * (`0xf39F…2266`, public by design). The first-party `mock` connector sends
 * through the local node, which holds that account unlocked — so this only
 * ever works against `npx hardhat node`, never a real network.
 *
 * Offered in the UI only when the app itself targets a local chain.
 */
export const DEMO_ACCOUNT_ADDRESS =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;

export function isDemoWalletOffered(): boolean {
  return CHAIN_ID === 31337 && /^http:\/\/(localhost|127\.0\.0\.1)/.test(RPC_URL);
}

export function hardhatDemoConnector() {
  return mock({ accounts: [DEMO_ACCOUNT_ADDRESS] });
}
