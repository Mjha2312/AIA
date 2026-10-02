import { loadConfig } from "./config.js";
import { getPool, closePool } from "./db.js";
import { runMigrations, defaultMigrationsDir } from "./migrate.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.DATABASE_URL);
  try {
    const applied = await runMigrations(pool, defaultMigrationsDir());
    logger.info({ applied }, "Migrations complete");
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
