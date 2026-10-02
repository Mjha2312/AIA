import { z } from "zod";

// Ambiguity note (documented in PR): SPEC types electionId as uint256 on
// chain. Over HTTP we accept a decimal string ("1", "42") and forward it to
// ethers as-is, so no precision is lost for large ids.
export const electionIdSchema = z
  .string()
  .regex(/^\d+$/, "electionId must be a decimal string (uint256)")
  .refine((v) => {
    try {
      return BigInt(v) > 0n;
    } catch {
      return false;
    }
  }, "electionId must be positive");

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
