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
