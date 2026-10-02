import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default("postgresql://aiavote:aiavote@localhost:5432/aiavote"),
  PORT: z.coerce.number().int().positive().default(4000),
  RPC_URL: z.string().default("http://localhost:8545"),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  REGISTRAR_PRIVATE_KEY: z.string().default("0x" + "0".repeat(64)),
  RELAYER_PRIVATE_KEY: z.string().default("0x" + "0".repeat(64)),
  WS_RPC_URL: z.string().default("ws://localhost:8545"),
  RELAY_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  INDEXER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  INDEXER_FROM_BLOCK: z.coerce.number().int().nonnegative().default(0),
  SERVER_SECRET: z.string().min(1, "SERVER_SECRET is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  MOCK_KYC: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  CHAIN_MODE: z.enum(["auto", "fake", "live"]).default("auto"),
  KYC_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
