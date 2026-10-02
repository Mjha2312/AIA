import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { hardhat } from 'wagmi/chains';
import type { Chain } from 'viem';

import { hardhatDemoConnector, isDemoWalletOffered } from './demo-connector';
import { CHAIN_ID, RPC_URL } from './env';

/**
 * Admin-only wallet. Voters never sign anything (SPEC: votes are relayed by the
 * backend), so this config is mounted in `/admin` only and never on the voter
 * path — one less bundle on low-end phones.
 */
const localChain: Chain = { ...hardhat, id: CHAIN_ID };

export const wagmiConfig = createConfig({
  chains: [localChain],
  connectors: [injected(), ...(isDemoWalletOffered() ? [hardhatDemoConnector()] : [])],
  ssr: true,
  transports: {
    [localChain.id]: http(RPC_URL)
  }
});

export { localChain as localChain };
