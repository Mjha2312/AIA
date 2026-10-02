import { Group } from '@semaphore-protocol/group';
import { generateProof, type SemaphoreProof } from '@semaphore-protocol/proof';
import type { Identity } from '@semaphore-protocol/identity';

/**
 * Proof as the backend expects it (`semaphoreProofSchema`): every uint256 a
 * decimal string, exactly 8 points. `generateProof` returns bigints, which
 * neither `JSON.stringify` nor the API accept, so conversion happens here —
 * in exactly one place.
 */
export interface WireProof {
  merkleTreeDepth: string;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  points: string[];
}

export function toWireProof(proof: SemaphoreProof): WireProof {
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth).toString(),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot).toString(),
    nullifier: BigInt(proof.nullifier).toString(),
    message: BigInt(proof.message).toString(),
    scope: BigInt(proof.scope).toString(),
    points: proof.points.map((point) => BigInt(point).toString())
  };
}

export interface VoteProofResult {
  proof: WireProof;
  /** Decimal nullifier — the receipt key. Kept client-side only. */
  nullifier: string;
}

/**
 * Proves membership of `identity` in the on-chain group and binds the ballot
 * (`message` = candidateIndex, `scope` = electionId). The proving keys are
 * fetched by the Semaphore package on first use, so callers should warn that
 * this step takes a few seconds.
 */
export async function generateVoteProof(
  identity: Identity,
  groupMembers: string[],
  candidateIndex: number,
  electionId: string
): Promise<VoteProofResult> {
  const group = new Group(groupMembers);
  const raw = await generateProof(identity, group, candidateIndex, electionId);
  const proof = toWireProof(raw);
  return { proof, nullifier: proof.nullifier };
}

/** Numeric membership check tolerant of decimal/hex member encodings. */
export function groupHasCommitment(members: string[], commitment: string): boolean {
  let wanted: bigint;
  try {
    wanted = BigInt(commitment);
  } catch {
    return false;
  }
  return members.some((member) => {
    try {
      return BigInt(member) === wanted;
    } catch {
      return false;
    }
  });
}
