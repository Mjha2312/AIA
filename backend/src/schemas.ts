import { z } from "zod";

// Ambiguity note (documented in PR): SPEC types electionId as uint256 on
// chain. Over HTTP we accept a decimal string ("0", "1", "42") and forward it
// to ethers as-is, so no precision is lost for large ids. Zero is allowed:
// on-chain election ids start at 0.
export const electionIdSchema = z
  .string()
  .regex(/^\d+$/, "electionId must be a decimal string (uint256)")
  .refine((v) => {
    try {
      BigInt(v);
      return true;
    } catch {
      return false;
    }
  }, "electionId must be a valid uint256");

// Semaphore identity commitments are uint256 values. Accept decimal strings,
// reject zero / non-numeric. Hex input is not accepted (simplest option).
export const identityCommitmentSchema = z
  .string()
  .regex(/^\d+$/, "identityCommitment must be a decimal string (uint256)")
  .refine((v) => {
    try {
      return BigInt(v) > 0n;
    } catch {
      return false;
    }
  }, "identityCommitment must be a positive integer");

export const kycStartSchema = z.object({
  electionId: electionIdSchema,
});

export const kycCompleteSchema = z.object({
  sessionId: z.string().min(1),
  mockEpic: z.string().optional(),
});

export const registerSchema = z.object({
  kycToken: z.string().min(1),
  electionId: electionIdSchema,
  identityCommitment: identityCommitmentSchema,
});

// Any uint256 as a decimal string (zero allowed: roots/nullifiers/messages
// can all legitimately be 0...0 except where the contract forbids it).
export const uint256StringSchema = z
  .string()
  .regex(/^\d+$/, "must be a decimal string (uint256)")
  .refine((v) => {
    try {
      BigInt(v);
      return true;
    } catch {
      return false;
    }
  }, "must be a valid uint256");

// Semaphore proof struct per ISemaphore.SemaphoreProof
// (merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points[8]).
export const semaphoreProofSchema = z.object({
  merkleTreeDepth: uint256StringSchema,
  merkleTreeRoot: uint256StringSchema,
  nullifier: uint256StringSchema,
  message: uint256StringSchema,
  scope: uint256StringSchema,
  points: z.array(uint256StringSchema).length(8, "points must have exactly 8 entries"),
});

// candidateIndex arrives as a JSON number or a decimal string; normalized to
// a decimal string so BigInt/ethers handling is uniform.
const candidateIndexSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => String(v));

export const relayVoteSchema = z.object({
  electionId: electionIdSchema,
  candidateIndex: candidateIndexSchema,
  proof: semaphoreProofSchema,
});
