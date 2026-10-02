import { Pool } from "pg";
import { logger } from "./logger.js";

let pool: Pool | null = null;

export function getPool(databaseUrl: string): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl });
    pool.on("error", (err) => {
      logger.error({ err }, "Unexpected pg pool error");
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
