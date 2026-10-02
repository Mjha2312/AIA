import * as fs from "node:fs";
import path from "node:path";

/**
 * Backend package root: the directory containing backend/package.json.
 * Walks up from the calling module, so resolution is identical under tsx
 * (src/...), compiled output (dist/src/...), and vitest. Fixed-depth
 * `path.resolve(__dirname, "..", ...)` silently breaks because src/ and
 * dist/src/ sit at different depths — migrations/ and the contracts/
 * artifacts each resolved to a nonexistent directory in one runtime.
 */
export function backendRoot(fromDir: string = __dirname): string {
  let dir = path.resolve(fromDir);
  for (let i = 0; i < 12; i++) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(dir, "package.json"), "utf8"),
      ) as { name?: unknown };
      if (parsed.name === "backend") return dir;
    } catch {
      // No (readable) package.json here — keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate backend package root from ${fromDir}`);
}

/** Monorepo root (parent of backend/), where contracts/ lives. */
export function repoRoot(): string {
  return path.resolve(backendRoot(), "..");
}
