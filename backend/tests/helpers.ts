import jwt from "jsonwebtoken";
import { createApp, type AppDeps } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { MockKycProvider } from "../src/kyc/mockProvider.js";
import { FakeRegistrar } from "../src/chain/registrar.js";
import { InMemoryRegistrationStore } from "../src/store.js";

export const TEST_JWT_SECRET = "test-jwt-secret";
export const TEST_SERVER_SECRET = "test-server-secret";

export interface TestContext extends AppDeps {
  registrar: FakeRegistrar;
  store: InMemoryRegistrationStore;
  kyc: MockKycProvider;
}

export function buildTestApp(): { app: ReturnType<typeof createApp>; ctx: TestContext } {
  const config: AppConfig = {
    DATABASE_URL: "postgresql://localhost:5432/unused",
    PORT: 4000,
    RPC_URL: "http://localhost:8545",
    CHAIN_ID: 31337,
    REGISTRAR_PRIVATE_KEY: "0x" + "0".repeat(64),
    SERVER_SECRET: TEST_SERVER_SECRET,
    JWT_SECRET: TEST_JWT_SECRET,
    MOCK_KYC: true,
    CHAIN_MODE: "fake",
    KYC_TOKEN_TTL_SECONDS: 600,
  };
  const ctx: TestContext = {
    config,
    kyc: new MockKycProvider(),
    registrar: new FakeRegistrar(),
    store: new InMemoryRegistrationStore(),
  };
  const app = createApp(ctx);
  return { app, ctx };
}

/** Full KYC flow helper: start + complete, returns the kycToken. */
export async function getKycToken(
  app: ReturnType<typeof createApp>,
  electionId = "1",
  mockEpic = "WB/12/345/678901",
): Promise<string> {
  const request = (await import("supertest")).default;
  const startRes = await request(app).post("/api/kyc/start").send({ electionId });
  if (startRes.status !== 200) throw new Error(`kyc/start failed: ${startRes.text}`);
  const completeRes = await request(app)
    .post("/api/kyc/complete")
    .send({ sessionId: startRes.body.sessionId, mockEpic });
  if (completeRes.status !== 200) throw new Error(`kyc/complete failed: ${completeRes.text}`);
  return completeRes.body.kycToken as string;
}

export function mintToken(
  subjectId: string,
  electionId: string,
  opts: { expired?: boolean; secret?: string } = {},
): string {
  const secret = opts.secret ?? TEST_JWT_SECRET;
  if (opts.expired) {
    return jwt.sign(
      { subjectId, electionId, type: "kyc", exp: Math.floor(Date.now() / 1000) - 10 },
      secret,
    );
  }
  return jwt.sign({ subjectId, electionId, type: "kyc" }, secret, { expiresIn: 600 });
}
