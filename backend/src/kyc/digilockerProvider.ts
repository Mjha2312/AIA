import type { KycProvider } from "./types.js";

/**
 * DigiLocker KYC provider (stub — not configured in this prototype).
 *
 * Intended real flow (TODO when credentials exist):
 * 1. `start(electionId)`: build a DigiLocker OAuth2 authorization URL with
 *    client_id, redirect_uri, state=sessionId, response_type=code, and redirect
 *    the voter there. Persist state -> electionId server-side.
 * 2. DigiLocker redirects back to our callback with `code` + `state`.
 * 3. `complete(...)`: exchange `code` for an access token at DigiLocker's
 *    token endpoint, fetch the eKYC document, and derive a stable,
 *    non-reversible subjectId (e.g. HMAC of the DigiLocker subject id).
 *
 * TODO: add DIGILOCKER_CLIENT_ID / DIGILOCKER_CLIENT_SECRET /
 * DIGILOCKER_REDIRECT_URI to .env.example and implement the OAuth exchange.
 * Do not invent endpoint URLs here — use the official DigiLocker API docs.
 */
export class DigiLockerKycProvider implements KycProvider {
  async start(_electionId: string): Promise<{ sessionId: string; redirectUrl: string }> {
    throw new Error("DigiLocker KYC is not configured (MOCK_KYC=false without credentials)");
  }

  async complete(
    _sessionId: string,
    _input: { mockEpic?: string },
  ): Promise<{ subjectId: string }> {
    throw new Error("DigiLocker KYC is not configured (MOCK_KYC=false without credentials)");
  }
}
