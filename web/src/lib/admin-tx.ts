import { encodeFunctionData, type Hex } from 'viem';

import { electionManager } from '@/abi/electionManager';
import { ELECTION_MANAGER_ADDRESS } from './chain';

/**
 * Calldata builders for the two proposals the admin panel offers. Encoded
 * against the generated `ElectionManager` ABI (copied from `contracts/abi` by
 * `npm run abi`), then submitted as the `data` of an `ECIMultiSig.submit`.
 */

export function encodeCreateElection(constituencyId: string, candidates: string[]): Hex {
  return encodeFunctionData({
    abi: electionManager,
    functionName: 'createElection',
    args: [constituencyId, candidates]
  });
}

export function encodeAdvancePhase(electionId: string): Hex {
  return encodeFunctionData({
    abi: electionManager,
    functionName: 'advancePhase',
    args: [BigInt(electionId)]
  });
}

export { ELECTION_MANAGER_ADDRESS };
