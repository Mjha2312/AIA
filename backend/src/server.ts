import { loadConfig } from "./config.js";
import { getPool, closePool } from "./db.js";
import { runMigrations, defaultMigrationsDir } from "./migrate.js";
import { createApp } from "./app.js";
import { selectKycProvider } from "./kyc/index.js";
import { selectRegistrar } from "./chain/registrar.js";
import { selectRelayer } from "./chain/relay.js";
import { PgRegistrationStore, InMemoryRegistrationStore } from "./store.js";
import { WsHub } from "./ws.js";
import { Indexer } from "./indexer/indexer.js";
import { EthersEventSource } from "./indexer/source.js";
import { InMemoryIndexerStore, PgIndexerStore } from "./indexer/store.js";
import { artifactPaths, fileExists, loadDeployment, loadManagerInterface } from "./chain/artifacts.js";
import { createRelayLogger, logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const relayLogger = createRelayLogger();

  // Postgres is required in production; fall back to memory only so `dev`
  // still boots without docker (registration uniqueness is then process-local).
  let store;
  let indexerStore;
  let poolAvailable = false;
  try {
    const pool = getPool(config.DATABASE_URL);
    await runMigrations(pool, defaultMigrationsDir());
    store = new PgRegistrationStore(pool);
    indexerStore = new PgIndexerStore(pool);
    poolAvailable = true;
    logger.info("Postgres connected; migrations applied");
  } catch (err) {
    logger.warn({ err }, "Postgres unavailable — using in-memory stores (dev only)");
    store = new InMemoryRegistrationStore();
    indexerStore = new InMemoryIndexerStore();
  }

  const kyc = selectKycProvider(config.MOCK_KYC);
  const registrar = await selectRegistrar({
    chainMode: config.CHAIN_MODE,
    rpcUrl: config.RPC_URL,
    registrarKey: config.REGISTRAR_PRIVATE_KEY,
    chainId: config.CHAIN_ID,
  });
  const relayer = await selectRelayer({
    chainMode: config.CHAIN_MODE,
    rpcUrl: config.RPC_URL,
    relayerKey: config.RELAYER_PRIVATE_KEY,
    chainId: config.CHAIN_ID,
    txTimeoutMs: config.RELAY_TX_TIMEOUT_MS,
  });

  const app = createApp({ config, kyc, registrar, store, relayer, indexerStore });
  const server = app.listen(config.PORT, () => {
    logger.info(`backend listening on :${config.PORT}`);
  });

  const hub = new WsHub();
  hub.attach(server);
  logger.info("WebSocket /ws attached");

  // Indexer: backfills from INDEXER_FROM_BLOCK (or the stored checkpoint),
  // then follows ElectionManager events live and broadcasts them on /ws.
  let indexer: Indexer | null = null;
  if (config.INDEXER_ENABLED) {
    if (!poolAvailable) {
      logger.warn("INDEXER_ENABLED but Postgres is unavailable — indexer skipped (dev only)");
    } else {
      try {
        const { managerAbiPath, deploymentPath } = artifactPaths();
        if (!(await fileExists(managerAbiPath)) || !(await fileExists(deploymentPath))) {
          throw new Error("contract artifacts or deployment file missing");
        }
        const [iface, deployment] = await Promise.all([loadManagerInterface(), loadDeployment()]);
        if (!deployment.ElectionManager) throw new Error("ElectionManager address missing in deployment file");
        const source = new EthersEventSource(config.WS_RPC_URL, deployment.ElectionManager, iface);
        indexer = new Indexer(source, indexerStore, iface, hub, {
          fromBlock: config.INDEXER_FROM_BLOCK,
          fetchElectionDetails: (electionId) => relayer.getElectionDetails?.(electionId) ?? Promise.resolve(null),
        });
        // Non-blocking: the server serves traffic while backfill runs;
        // failures are logged, and live drops reconnect with backoff.
        indexer.start().catch((err: unknown) => {
          relayLogger.warn({ err }, "indexer stopped with error");
        });
        logger.info("indexer started");
      } catch (err) {
        logger.warn({ err }, "indexer failed to start — continuing without live indexing");
        indexer = null;
      }
    }
  }

  const shutdown = async (): Promise<void> => {
    await indexer?.stop().catch(() => undefined);
    await hub.close().catch(() => undefined);
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
