import { z, type ZodTypeAny } from 'zod';

import { API_URL, USE_MOCKS, WS_URL } from './env';
import {
  apiErrorEnvelopeSchema,
  auditRequestSchema,
  auditResponseSchema,
  auditsSchema,
  chainEventBatchSchema,
  electionSchema,
  groupSchema,
  kycSessionSchema,
  kycTokenSchema,
  receiptSchema,
  registerRequestSchema,
  relayVoteRequestSchema,
  relayVoteResponseSchema,
  turnoutSchema,
  txHashSchema,
  votesPageSchema,
  type AuditResponse,
  type Audits,
  type ChainEventBatch,
  type Election,
  type Group,
  type KycSession,
  type KycToken,
  type Receipt,
  type RelayVoteResponse,
  type Turnout,
  type VotesPage
} from './schemas';

/**
 * Typed client for the backend REST API in `docs/SPEC.md`.
 *
 * Privacy: this module never logs request or response bodies. KYC tokens and
 * Semaphore proofs pass through and are not persisted, and no client-side IP or
 * identity bookkeeping happens here.
 *
 * With `NEXT_PUBLIC_USE_MOCKS=true` every call is served by the route handlers
 * under `/api-mock`, so the UI can be built with no backend running.
 */

const API_PREFIX = USE_MOCKS ? '/api-mock/api' : `${API_URL}/api`;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

type QueryValue = string | number | boolean | undefined | null;

export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

/** `WebSocket /ws` endpoint, used by `subscribeToChainEvents`. */
export function wsUrl(query?: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return `${USE_MOCKS ? '/api-mock/api' : WS_URL}/ws${qs ? `?${qs}` : ''}`;
}

async function request<S extends ZodTypeAny>(url: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers
    }
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = apiErrorEnvelopeSchema.safeParse(payload);
    throw new ApiError(
      envelope.success ? envelope.data.error.code : 'http_error',
      envelope.success ? envelope.data.error.message : `Request failed with status ${response.status}`,
      response.status
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('invalid_response', parsed.error.issues.map((issue) => issue.message).join('; '), response.status);
  }
  return parsed.data;
}

function jsonBody(body: unknown): string {
  return JSON.stringify(body);
}

export const api = {
  /** SPEC: `GET /elections` -> `Election[]` */
  getElections(signal?: AbortSignal): Promise<Election[]> {
    return request(apiUrl('/elections'), electionSchema.array(), { signal });
  },

  /** SPEC: `GET /elections/:id` -> `Election` (+ `tally` once phase >= Tallying) */
  getElection(electionId: string, signal?: AbortSignal): Promise<Election> {
    return request(apiUrl(`/elections/${electionId}`), electionSchema, { signal });
  },

  /** SPEC: `GET /elections/:id/turnout` */
  getTurnout(electionId: string, signal?: AbortSignal): Promise<Turnout> {
    return request(apiUrl(`/elections/${electionId}/turnout`), turnoutSchema, { signal });
  },

  /** SPEC: `GET /elections/:id/votes?cursor=&limit=` */
  getVotes(electionId: string, options?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<VotesPage> {
    return request(
      apiUrl(`/elections/${electionId}/votes`, { cursor: options?.cursor, limit: options?.limit }),
      votesPageSchema,
      { signal }
    );
  },

  /** SPEC: `GET /elections/:id/group` -> identity commitments (public by design) */
  getGroup(electionId: string, signal?: AbortSignal): Promise<Group> {
    return request(apiUrl(`/elections/${electionId}/group`), groupSchema, { signal });
  },

  /** SPEC: `GET /receipts/:nullifier` */
  getReceipt(nullifier: string, signal?: AbortSignal): Promise<Receipt> {
    return request(apiUrl(`/receipts/${encodeURIComponent(nullifier)}`), receiptSchema, { signal });
  },

  /** SPEC: `POST /kyc/start { electionId }` */
  startKyc(electionId: string): Promise<KycSession> {
    return request(apiUrl('/kyc/start'), kycSessionSchema, {
      method: 'POST',
      body: jsonBody({ electionId })
    });
  },

  /** SPEC: `POST /kyc/complete { sessionId, mockEpic? }` */
  completeKyc(sessionId: string, mockEpic?: string): Promise<KycToken> {
    return request(apiUrl('/kyc/complete'), kycTokenSchema, {
      method: 'POST',
      body: jsonBody(mockEpic === undefined ? { sessionId } : { sessionId, mockEpic })
    });
  },

  /** SPEC: `POST /register { kycToken, electionId, identityCommitment }` */
  register(input: { kycToken: string; electionId: string; identityCommitment: string }): Promise<{ txHash: string }> {
    return request(apiUrl('/register'), txHashSchema, {
      method: 'POST',
      body: jsonBody(registerRequestSchema.parse(input))
    });
  },

  /** SPEC: `POST /relay/vote { electionId, candidateIndex, proof }` */
  relayVote(input: { electionId: string; candidateIndex: number; proof: unknown }): Promise<RelayVoteResponse> {
    return request(apiUrl('/relay/vote'), relayVoteResponseSchema, {
      method: 'POST',
      body: jsonBody(relayVoteRequestSchema.parse(input))
    });
  },

  /** SPEC: `POST /elections/:id/audit { booths }` */
  audit(electionId: string, booths: { boothId: string; counts: number[] }[]): Promise<AuditResponse> {
    return request(apiUrl(`/elections/${electionId}/audit`), auditResponseSchema, {
      method: 'POST',
      body: jsonBody(auditRequestSchema.parse({ booths }))
    });
  },

  /** Backend `GET /elections/:id/audits` -> past shadow-audit runs. */
  getAudits(electionId: string, signal?: AbortSignal): Promise<Audits> {
    return request(apiUrl(`/elections/${electionId}/audits`), auditsSchema, { signal });
  },

  /**
   * Mock-only replacement for `WebSocket /ws`: the route handler returns a
   * batch of events newer than `since`. Present so the client transport has one
   * shape in both modes.
   */
  pollChainEvents(electionId: string, since: number, signal?: AbortSignal): Promise<ChainEventBatch> {
    return request(apiUrl('/ws', { electionId, since }), chainEventBatchSchema, { signal });
  }
} as const;

export type Api = typeof api;