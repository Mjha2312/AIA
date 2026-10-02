import { existsSync } from "node:fs";
import path from "node:path";

/**
 * backend/ package root.
 * - dev/test (tsx, vitest): sources run from backend/src -> one level up.
 * - production (tsc -> dist/src): compiled output -> two levels up.
 * Resolved by probing for package markers so both layouts work.
 */
export function backendRootDir(): string {
  const candidates = [path.resolve(__dirname, ".."), path.resolve(__dirname, "..", "..")];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "openapi.yaml")) || existsSync(path.join(candidate, "migrations"))) {
      return candidate;
    }
  }
  return candidates[0];
}
