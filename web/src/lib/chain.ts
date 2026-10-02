import { localhostDeployment } from '@/abi/deployments';

/**
 * On-chain addresses for the admin panel.
 *
 * Defaults are copied from `contracts/deployments/localhost.json` at build
 * time (`npm run abi`) — this module never imports across packages. The
 * `NEXT_PUBLIC_*` overrides exist so a deployed staging chain can be pointed
 * at without touching generated files.
 */

function cleanAddress(value: string | undefined, fallback: string): `0x${string}` {
  const candidate = value && value.length > 0 ? value : fallback;
  if (/^0x[0-9a-fA-F]{40}$/.test(candidate)) return candidate as `0x${string}`;
  return fallback as `0x${string}`;
}

/** ECI multi-sig wallet (SPEC: `ECIMultiSig`, owner of `ElectionManager`). */
export const MULTISIG_ADDRESS = cleanAddress(
  process.env.NEXT_PUBLIC_MULTISIG_ADDRESS,
  localhostDeployment.ECIMultiSig
);

/** Election registry the multi-sig governs. */
export const ELECTION_MANAGER_ADDRESS = cleanAddress(
  process.env.NEXT_PUBLIC_ELECTION_MANAGER_ADDRESS,
  localhostDeployment.ElectionManager
);
