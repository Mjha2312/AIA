/**
 * Runtime env access. Every public variable is read here, with **static**
 * `process.env.NEXT_PUBLIC_*` member access — Next only inlines those, a
 * computed `process.env[name]` would silently resolve to `undefined` in the
 * browser bundle.
 */

function cleanUrl(value: string | undefined, fallback: string): string {
  return (value && value.length > 0 ? value : fallback).replace(/\/+$/, '');
}

function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Mocks make the whole UI runnable with no backend (SPEC: backend on :4000). */
export const USE_MOCKS = parseFlag(process.env.NEXT_PUBLIC_USE_MOCKS, false);

/** Base URL of the Express backend, without the `/api` prefix. */
export const API_URL = cleanUrl(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4000');

/** Hardhat node, used by the admin wallet only. */
export const RPC_URL = cleanUrl(process.env.NEXT_PUBLIC_RPC_URL, 'http://localhost:8545');

export const CHAIN_ID = parseNumber(process.env.NEXT_PUBLIC_CHAIN_ID, 31337);

/** Websocket form of `API_URL`, for the SPEC `WebSocket /ws` feed. */
export const WS_URL = API_URL.replace(/^http/, 'ws');

export const NEXT_PUBLIC_ENV = {
  USE_MOCKS,
  API_URL,
  RPC_URL,
  CHAIN_ID,
  WS_URL
} as const;