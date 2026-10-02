import { loadConfig } from "./config.js";
import { getPool, closePool } from "./db.js";
import { runMigrations, defaultMigrationsDir } from "./migrate.js";
import { createApp } from "./app.js";
import { selectKycProvider } from "./kyc/index.js";
import { selectRegistrar } from "./chain/registrar.js";
import { PgRegistrationStore, InMemoryRegistrationStore } from "./store.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Postgres is required in production; fall back to memory only so `dev`
  // still boots without docker (registration uniqueness is then process-local).
  let store;
  try {
    const pool = getPool(config.DATABASE_URL);
    await runMigrations(pool, defaultMigrationsDir());
    store = new PgRegistrationStore(pool);
    logger.info("Postgres connected; migrations applied");
  } catch (err) {
    logger.warn({ err }, "Postgres unavailable — using in-memory registration store (dev only)");
    store = new InMemoryRegistrationStore();
  }

  const kyc = selectKycProvider(config.MOCK_KYC);
  const registrar = await selectRegistrar({
    chainMode: config.CHAIN_MODE,
    rpcUrl: config.RPC_URL,
    registrarKey: config.REGISTRAR_PRIVATE_KEY,
    chainId: config.CHAIN_ID,
  });

  const app = createApp({ config, kyc, registrar, store });
  const server = app.listen(config.PORT, () => {
    logger.info(`backend listening on :${config.PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await closePool().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  logger.error({ err }, "Failed to start backend");
  process.exit(1);
});
