import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { createRelayLogger, logger } from "./logger.js";
import { sendError, errorHandler, zodErrorMessage } from "./errors.js";
import { kycStartSchema, kycCompleteSchema, registerSchema, relayVoteSchema } from "./schemas.js";
import type { KycProvider } from "./kyc/index.js";
import { computeEligibilityHash } from "./privacy.js";
import type { Registrar } from "./chain/registrar.js";
import type { RegistrationStore } from "./store.js";
import { VOTING_PHASE, type Relayer } from "./chain/relay.js";
import { mapRelayChainError } from "./chain/errors.js";
import { loadRelayDecodeInterface } from "./chain/artifacts.js";
import type { Interface } from "ethers";

export interface AppDeps {
  config: AppConfig;
  kyc: KycProvider;
  registrar: Registrar;
  store: RegistrationStore;
  relayer: Relayer;
}

// Decoded once, reused for mapping on-chain reverts to API errors.
let decodeIface: Promise<Interface> | null = null;
function relayDecodeInterface(): Promise<Interface> {
  if (!decodeIface) decodeIface = loadRelayDecodeInterface();
  return decodeIface;
}

const kycClaimsSchema = z.object({
  subjectId: z.string().min(1),
  electionId: z.string().regex(/^\d+$/),
  type: z.literal("kyc"),
});

export type KycClaims = z.infer<typeof kycClaimsSchema>;

export function createApp(deps: AppDeps): express.Express {
  const { config, kyc, registrar, store, relayer } = deps;
  const app = express();
  // Privacy (SPEC): never log IPs, headers, or user agents on /relay/vote.
  // The relay route gets no pino-http access log at all, and its handler logs
  // outcome metadata only (electionId, txHash, error code) via a redacted
  // route logger — never the proof, nullifier, IP, or headers.
  const relayLogger = createRelayLogger();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));
  // Privacy: pino-http logs method/url/status but never bodies, so
  // kycSubjectId / identityCommitments / tokens stay out of access logs.
  const httpLogger = pinoHttp({ logger });
  app.use((req, res, next) => {
    if (req.path === "/api/relay/vote") return next();
    httpLogger(req, res, next);
  });

  const sensitiveLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.use("/api/kyc", sensitiveLimiter);
  app.use("/api/register", sensitiveLimiter);
  app.use("/api/relay", sensitiveLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // The KycProvider interface returns only { subjectId } from complete(), so
  // the route layer binds sessionId -> electionId at start time. The election
  // in the minted kycToken always comes from this server-side record, never
  // from client input — a token cannot be retargeted at another election.
  const sessionElections = new Map<string, string>();

  // POST /api/kyc/start { electionId } -> { sessionId, redirectUrl }
  app.post("/api/kyc/start", async (req, res) => {
    const parsed = kycStartSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(parsed.error));
      return;
    }
    try {
      const session = await kyc.start(parsed.data.electionId);
      sessionElections.set(session.sessionId, parsed.data.electionId);
      res.json(session);
    } catch (err) {
      logger.error({ err }, "kyc start failed");
      sendError(res, 501, "KYC_NOT_CONFIGURED", (err as Error).message);
    }
  });

  // POST /api/kyc/complete { sessionId, mockEpic? } -> { kycToken }
  app.post("/api/kyc/complete", async (req, res) => {
    const parsed = kycCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(parsed.error));
      return;
    }
    const { sessionId, mockEpic } = parsed.data;
    const electionId = sessionElections.get(sessionId);
    if (!electionId) {
      sendError(res, 404, "UNKNOWN_SESSION", "Unknown or expired KYC session");
      return;
    }
    try {
      const { subjectId } = await kyc.complete(sessionId, { mockEpic });
      sessionElections.delete(sessionId);
      // Privacy: the raw subjectId lives only inside this short-lived JWT
      // (10 min expiry). It is never persisted or logged.
      const kycToken = jwt.sign({ subjectId, electionId, type: "kyc" }, config.JWT_SECRET, {
        expiresIn: config.KYC_TOKEN_TTL_SECONDS,
      });
      res.json({ kycToken });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "UNKNOWN_SESSION") {
        sessionElections.delete(sessionId);
        sendError(res, 404, "UNKNOWN_SESSION", "Unknown or expired KYC session");
        return;
      }
      if (code === "INVALID_EPIC") {
        sendError(res, 400, "INVALID_EPIC", (err as Error).message);
        return;
      }
      logger.error({ err }, "kyc complete failed");
      sendError(res, 501, "KYC_NOT_CONFIGURED", (err as Error).message);
    }
  });

  // POST /api/register { kycToken, electionId, identityCommitment } -> { txHash }
  app.post("/api/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(parsed.error));
      return;
    }
    const { kycToken, electionId, identityCommitment } = parsed.data;

    let claims: KycClaims;
    try {
      const decoded = jwt.verify(kycToken, config.JWT_SECRET);
      const checked = kycClaimsSchema.safeParse(decoded);
      if (!checked.success) {
        sendError(res, 401, "INVALID_TOKEN", "kycToken has invalid claims");
        return;
      }
      claims = checked.data;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        sendError(res, 401, "TOKEN_EXPIRED", "kycToken has expired");
        return;
      }
      sendError(res, 401, "INVALID_TOKEN", "kycToken is invalid");
      return;
    }

    if (claims.electionId !== electionId) {
      sendError(res, 403, "ELECTION_MISMATCH", "kycToken was issued for a different election");
      return;
    }

    // Privacy: only the HMAC eligibility hash is stored. subjectId,
    // identityCommitment, and the link between them never touch the DB or logs.
    const eligibilityHash = computeEligibilityHash(config.SERVER_SECRET, claims.subjectId, electionId);

    const inserted = await store.insert(electionId, eligibilityHash);
    if (!inserted) {
      sendError(res, 409, "ALREADY_REGISTERED", "This voter is already registered for this election");
      return;
    }

    try {
      const { txHash } = await registrar.registerVoter(electionId, identityCommitment);
      res.json({ txHash });
    } catch (err) {
      // Roll back the DB insert so the voter can retry registration.
      await store.remove(electionId, eligibilityHash);
      logger.error({ err }, "on-chain registerVoter failed; rolled back DB insert");
      sendError(res, 502, "CHAIN_ERROR", "On-chain registration failed; please retry");
    }
  });

  // POST /api/relay/vote { electionId, candidateIndex, proof } -> { txHash, voteHash }
  app.post("/api/relay/vote", async (req, res) => {
    const parsed = relayVoteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(parsed.error));
      return;
    }
    const { electionId, candidateIndex, proof } = parsed.data;

    // Cheap pre-checks before touching the chain: existence, Voting phase,
    // candidate range, and proof scope/message binding (numeric compare so
    // "01" and "1" are treated as the same uint256).
    let snapshot;
    try {
      snapshot = await relayer.getElection(electionId);
    } catch {
      relayLogger.warn({ electionId, code: "CHAIN_ERROR" }, "relay pre-check failed");
      sendError(res, 502, "CHAIN_ERROR", "Could not read election state from chain");
      return;
    }
    if (!snapshot.exists) {
      sendError(res, 404, "ELECTION_NOT_FOUND", "Election does not exist");
      return;
    }
    if (snapshot.phase !== VOTING_PHASE) {
      sendError(res, 409, "WRONG_PHASE", "Election is not in Voting phase");
      return;
    }
    if (BigInt(candidateIndex) >= BigInt(snapshot.candidateCount)) {
      sendError(res, 400, "INVALID_CANDIDATE", "candidateIndex is out of range");
      return;
    }
    if (BigInt(proof.scope) !== BigInt(electionId)) {
      sendError(res, 400, "SCOPE_MISMATCH", "Proof scope must equal the electionId");
      return;
    }
    if (BigInt(proof.message) !== BigInt(candidateIndex)) {
      sendError(res, 400, "MESSAGE_MISMATCH", "Proof message must equal the candidateIndex");
      return;
    }

    try {
      const result = await relayer.castVote(electionId, candidateIndex, proof);
      relayLogger.info({ electionId, txHash: result.txHash }, "vote relayed");
      res.json(result);
    } catch (err) {
      const iface = await relayDecodeInterface();
      const mapped = mapRelayChainError(err, iface);
      relayLogger.warn({ electionId, code: mapped.code }, "vote relay failed");
      sendError(res, mapped.status, mapped.code, mapped.message);
    }
  });

  app.use(errorHandler);
  return app;
}
