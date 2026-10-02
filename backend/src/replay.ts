import { loadConfig } from "./config.js";
import { getPool, closePool } from "./db.js";
import { runMigrations, defaultMigrationsDir } from "./migrate.js";
import { Indexer } from "./indexer/indexer.js";
import { EthersEventSource } from "./indexer/source.js";
import { PgIndexerStore } from "./indexer/store.js";
import { loadDeployment, loadManagerInterface } from "./chain/artifacts.js";
import { logger } from "./logger.js";

/* eslint-disable no-console -- dev:replay prints a row-count report to stdout. */

/**
 * One-shot indexer backfill for development:
 *   npm run dev:replay
 * Requires Postgres (migrations applied here) plus a deployed chain with
 * seeded elections reachable at WS_RPC_URL. Replays are idempotent, so
 * re-running only fills gaps. Prints per-table row counts and exits.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config.DATABASE_URL);
  await runMigrations(pool, defaultMigrationsDir());

  const [iface, deployment] = await Promise.all([loadManagerInterface(), loadDeployment()]);
  if (!deployment.ElectionManager) {
    throw new Error("ElectionManager address missing in contracts/deployments/localhost.json");
  }

  const source = new EthersEventSource(config.WS_RPC_URL, deployment.ElectionManager, iface);
  const store = new PgIndexerStore(pool);
  const indexer = new Indexer(source, store, iface, null, { fromBlock: config.INDEXER_FROM_BLOCK });
  try {
    await indexer.runOnce();
    const counts = await store.getCounts();
    const checkpoint = await store.getLastProcessedBlock();
    console.log("dev:replay backfill complete");
    console.table({ ...counts, lastProcessedBlock: checkpoint });
    logger.info({ counts, checkpoint }, "dev:replay backfill complete");
  } finally {
    await indexer.stop().catch(() => undefined);
    await closePool().catch(() => undefined);
  }
}

main().catch((err) => {
  logger.error({ err }, "dev:replay failed");
  process.exit(1);
});
