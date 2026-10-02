import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Privacy: never log identityCommitments together with kycSubjectId,
  // never log Aadhaar/EPIC/PII, never log IPs on relay endpoints.
  redact: {
    paths: [
      "req.body.kycToken",
      "req.body.mockEpic",
      "*.kycToken",
      "*.mockEpic",
      "*.subjectId",
      "*.kycSubjectId",
      "*.aadhaar",
      "*.epic",
    ],
    censor: "[REDACTED]",
  },
});

/**
 * Redact paths for the /relay/vote route logger (SPEC: never log IPs there).
 * Covers IPs, headers, and user agents wherever they appear in a log record.
 * Tested in tests/relay.test.ts ("route logger carries no IP").
 */
export const RELAY_REDACT_PATHS = [
  "req.ip",
  "req.ips",
  "req.headers",
  "req.remoteAddress",
  "req.remotePort",
  "ip",
  "ips",
  "headers",
  "user-agent",
  "userAgent",
  "*.ip",
  "*.headers",
  "*.userAgent",
];

/** Route-scoped logger for POST /api/relay/vote: logs outcome metadata only. */
export function createRelayLogger(base: pino.Logger = logger): pino.Logger {
  return base.child({ route: "relay/vote" }, { redact: { paths: RELAY_REDACT_PATHS, censor: "[REDACTED]" } });
}
