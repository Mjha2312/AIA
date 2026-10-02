import { createHmac } from "node:crypto";

/**
 * eligibilityHash = HMAC-SHA256(SERVER_SECRET, subjectId + ":" + electionId).
 * This is the ONLY voter-derived value persisted (see docs/SPEC.md privacy
 * rules). It enforces one registration per person per election without
 * storing Aadhaar, EPIC, subjectId, or identityCommitment.
 */
export function computeEligibilityHash(
  serverSecret: string,
  subjectId: string,
  electionId: string,
): string {
  return createHmac("sha256", serverSecret).update(`${subjectId}:${electionId}`).digest("hex");
}
