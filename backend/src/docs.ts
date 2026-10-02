import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { backendRootDir } from "./paths.js";

let cached: { doc: unknown; raw: string } | null = null;

/** Loads backend/openapi.yaml once (parsed object + raw text). */
export async function loadOpenApi(): Promise<{ doc: unknown; raw: string }> {
  if (!cached) {
    const raw = await fs.readFile(path.join(backendRootDir(), "openapi.yaml"), "utf8");
    cached = { doc: parseYaml(raw), raw };
  }
  return cached;
}
