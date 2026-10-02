import { promises as fs } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { backendRootDir } from "./paths.js";

/** Plain-SQL migration runner: applies backend/migrations/*.sql in order. */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const entries = await fs.readdir(migrationsDir);
  const files = entries.filter((f) => f.endsWith(".sql")).sort();
  const appliedRows = await pool.query<{ filename: string }>("SELECT filename FROM migrations");
  const applied = new Set(appliedRows.rows.map((r) => r.filename));

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      newlyApplied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return newlyApplied;
}

export function defaultMigrationsDir(): string {
  return path.join(backendRootDir(), "migrations");
}
