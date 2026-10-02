import { z } from 'zod';

import { Phase, PHASE_NAMES } from './phases';

/**
 * Hand-written mirrors of the `docs/SPEC.md` REST API. Kept in one file so the
 * contract can be diffed against the spec in a single review.
 *
 * SPEC ambiguity (documented in the PR): `phase` is a numeric enum on chain but
 * the JSON envelope is unspecified, so both the numeric value and the enum name
 * are accepted and normalised to the numeric `Phase`.
 */

export const uint256Schema = z.string().regex(/^\d+$/, 'expected a decimal uint256 string');

export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex string');

/**
 * Block timestamps arrive as epoch seconds from the mock API and as ISO-8601
 * strings from the real backend (`blockTimestamp.toISOString()`). Accept both
 * and normalise to epoch seconds so the rest of the app has one shape.
 */
const epochSecondsSchema = z.union([z.number().int().nonnegative(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'number') return value;
  const parsed = Math.floor(Date.parse(value) / 1000);
  if (!Number.isFinite(parsed) || parsed < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid timestamp "${value}"` });
    return 0;
  }
  return parsed;
});

/** Nullable block timestamp; missing keys (e.g. `{ found: false }`) mean null. */
const nullableEpochSecondsSchema = epochSecondsSchema
  .nullish()
  .transform((value): number | null => value ?? null);

const nullableHashSchema = hashSchema.nullish().transform((value): string | null => value ?? null);

const nullableBlockNumberSchema = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value): number | null => value ?? null);

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address');

const phaseNameSchema = z.enum(PHASE_NAMES);

export const phaseSchema = z
  .union([phaseNameSchema, z.number().int().min(0).max(PHASE_NAMES.length - 1)])
  .transform((value, ctx): Phase => {
    const numeric = typeof value === 'number' ? value : Phase[value];
    if (numeric === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown phase "${String(value)}"` });
      return Phase.Setup;
    }
    return numeric as Phase;
  });

/** SPEC: `Election` = id, constituencyId, candidates, phase (+ counters). */
export const electionSchema = z.object({
  id: uint256Schema,
  constituencyId: z.string(),
  candidates: z.array(z.string()),
  phase: phaseSchema,
  registeredCount: z.number().int().nonnegative().default(0),
  votedCount: z.number().int().nonnegative().default(0),
  turnoutPct: z.number().min(0).max(100).nullish(),
  /** SPEC: present only once `phase >= Tallying`. */
  tally: z.array(z.number().int().nonnegative()).nullish()
});

export type Election = z.infer<typeof electionSchema>;

/** SPEC: `GET /elections/:id/turnout` -> `{ registered, voted, turnoutPct }`. */
export const turnoutSchema = z.object({
  registered: z.number().int().nonnegative(),
  voted: z.number().int().nonnegative(),
  turnoutPct: z.number().min(0).max(100)
});

export type Turnout = z.infer<typeof turnoutSchema>;

/** SPEC: `GET /elections/:id/votes?cursor=&limit=`. */
export const voteSchema = z.object({
  voteHash: hashSchema,
  nullifier: z.string().min(1),
  candidateIndex: z.number().int().nonnegative(),
  txHash: hashSchema,
  blockNumber: z.number().int().nonnegative(),
  timestamp: epochSecondsSchema
});

export type Vote = z.infer<typeof voteSchema>;

export const votesPageSchema = z.object({
  items: z.array(voteSchema),
  nextCursor: z.string().nullish()
});

export type VotesPage = z.infer<typeof votesPageSchema>;

/** SPEC: `GET /elections/:id/group` -> identity commitments for the Merkle tree. */
export const groupSchema = z.object({
  members: z.array(z.string().min(1))
});

export type Group = z.infer<typeof groupSchema>;

/** SPEC: `GET /receipts/:nullifier` -> `{ found, ... }`. */
export const receiptSchema = z.object({
  found: z.boolean(),
  voteHash: nullableHashSchema,
  txHash: nullableHashSchema,
  blockNumber: nullableBlockNumberSchema,
  timestamp: nullableEpochSecondsSchema
});

export type Receipt = z.infer<typeof receiptSchema>;

/** SPEC: `POST /kyc/start { electionId }` -> `{ sessionId, redirectUrl }`. */
export const kycSessionSchema = z.object({
  sessionId: z.string().min(1),
  redirectUrl: z.string().min(1)
});

export type KycSession = z.infer<typeof kycSessionSchema>;

/** SPEC: `POST /kyc/complete { sessionId, mockEpic? }` -> `{ kycToken }` (short-lived JWT). */
export const kycTokenSchema = z.object({
  kycToken: z.string().min(1)
});

export type KycToken = z.infer<typeof kycTokenSchema>;

/** SPEC: `POST /register { kycToken, electionId, identityCommitment }` -> `{ txHash }`. */
export const registerRequestSchema = z.object({
  kycToken: z.string().min(1),
  electionId: uint256Schema,
  identityCommitment: z.string().min(1)
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const txHashSchema = z.object({
  txHash: hashSchema
});

/** SPEC: `POST /relay/vote { electionId, candidateIndex, proof }`. */
export const relayVoteRequestSchema = z.object({
  electionId: uint256Schema,
  candidateIndex: z.number().int().nonnegative(),
  proof: z.unknown()
});

export type RelayVoteRequest = z.infer<typeof relayVoteRequestSchema>;

export const relayVoteResponseSchema = z.object({
  txHash: hashSchema,
  voteHash: hashSchema
});

export type RelayVoteResponse = z.infer<typeof relayVoteResponseSchema>;

/** SPEC: `POST /elections/:id/audit { booths }` -> `{ match, chainTally, evmTally, diff }`. */
export const auditRequestSchema = z.object({
  booths: z.array(
    z.object({
      boothId: z.string().min(1),
      counts: z.array(z.number().int().nonnegative())
    })
  )
});

export type AuditRequest = z.infer<typeof auditRequestSchema>;

export const auditResponseSchema = z.object({
  match: z.boolean(),
  chainTally: z.array(z.number().int().nonnegative()),
  evmTally: z.array(z.number().int().nonnegative()),
  diff: z.array(z.number().int())
});

export type AuditResponse = z.infer<typeof auditResponseSchema>;

/** SPEC: `WebSocket /ws` pushes `{ type: "VoteCast" | "PhaseChanged" | "VoterRegistered", ... }`. */
export const chainEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('VoteCast'),
    electionId: uint256Schema,
    nullifier: z.string().min(1),
    candidateIndex: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal('PhaseChanged'),
    electionId: uint256Schema,
    newPhase: phaseSchema
  }),
  z.object({
    type: z.literal('VoterRegistered'),
    electionId: uint256Schema,
    identityCommitment: z.string().min(1)
  })
]);

export type ChainEvent = z.infer<typeof chainEventSchema>;

/** Mock polling transport speaks the same shape plus a cursor. */
export const chainEventBatchSchema = z.object({
  cursor: z.number().int().nonnegative(),
  events: z.array(chainEventSchema)
});

export type ChainEventBatch = z.infer<typeof chainEventBatchSchema>;

/** SPEC: `Errors: { error: { code, message } }`. */
export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

/**
 * Backend `GET /elections/:id/audits` (added after the shared SPEC froze, see
 * `backend/src/routes/audit.ts`): past shadow-audit runs for one election.
 * `createdAt` is an ISO-8601 string from the backend and epoch seconds from
 * the mock API; both normalise to epoch seconds.
 */
export const auditRunSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().nonnegative()]).transform((value) => String(value)),
  electionId: uint256Schema,
  evmTally: z.array(z.number().int().nonnegative()),
  chainTally: z.array(z.number().int().nonnegative()),
  match: z.boolean(),
  createdAt: nullableEpochSecondsSchema
});

export type AuditRun = z.infer<typeof auditRunSchema>;

export const auditsSchema = z.object({
  audits: z.array(auditRunSchema)
});

export type Audits = z.infer<typeof auditsSchema>;

/** SPEC: identityCommitment is a Poseidon hash, rendered as 0x-hex. */
export const identityCommitmentSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);