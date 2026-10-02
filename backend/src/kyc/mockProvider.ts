import { createHash, randomUUID } from "node:crypto";
import type { KycProvider } from "./types.js";

/**
 * Plausible EPIC-like format for the mock provider, e.g. "WB/12/345/678901":
 * 2-3 uppercase letters, then 2 / 3 / 6 digit groups separated by slashes.
 * This is a prototype-only format check, not a real EPIC validation.
 */
export const MOCK_EPIC_PATTERN = /^[A-Z]{2,3}\/[0-9]{2}\/[0-9]{3}\/[0-9]{6}$/;

export function isValidMockEpic(value: string): boolean {
  return MOCK_EPIC_PATTERN.test(value.trim());
}

/** Stable pseudonymous subject id derived from the mock EPIC (sha256 hex). */
export function subjectIdForMockEpic(mockEpic: string): string {
  return createHash("sha256").update(mockEpic.trim()).digest("hex");
}

export class MockKycProvider implements KycProvider {
  private sessions = new Map<string, { electionId: string; createdAt: number }>();

  async start(electionId: string): Promise<{ sessionId: string; redirectUrl: string }> {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { electionId, createdAt: Date.now() });
    // Local mock page path (frontend implements /kyc/mock?session=...).
    return { sessionId, redirectUrl: `/kyc/mock?session=${sessionId}&election=${electionId}` };
  }

  async complete(sessionId: string, input: { mockEpic?: string }): Promise<{ subjectId: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const err = new Error("Unknown or expired KYC session") as Error & { code: string };
      err.code = "UNKNOWN_SESSION";
      throw err;
    }
    const mockEpic = input.mockEpic ?? "";
    if (!isValidMockEpic(mockEpic)) {
      const err = new Error(
        'Invalid mockEpic format. Expected EPIC-like "SS/DD/DDD/DDDDDD", e.g. "WB/12/345/678901".',
      ) as Error & { code: string };
      err.code = "INVALID_EPIC";
      throw err;
    }
    // NOTE: session is single-use; consume it on success. The raw mockEpic is
    // never persisted — only sha256(mockEpic) leaves this function.
    this.sessions.delete(sessionId);
    return { subjectId: subjectIdForMockEpic(mockEpic) };
  }
}
