import { Identity } from '@semaphore-protocol/identity';

const STORAGE_PREFIX = 'aia-vote:identity:';

/**
 * Prototype mock-KYC EPIC format, mirrored from
 * `backend/src/kyc/mockProvider.ts` (`MOCK_EPIC_PATTERN`). Client-side only
 * so an obvious typo never reaches the server.
 */
export const MOCK_EPIC_PATTERN = /^[A-Z]{2,3}\/[0-9]{2}\/[0-9]{3}\/[0-9]{6}$/;

export function isValidMockEpic(value: string): boolean {
  return MOCK_EPIC_PATTERN.test(value.trim());
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage;
    if (!ls) throw new Error('localStorage unavailable');
    const probe = 'aia-vote:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

/**
 * In-memory fallback for SSR, private browsing, or environments without
 * `localStorage`. Survives the session but not a reload — the register step
 * already treats a re-registration as already-done, so nothing breaks.
 */
const memoryFallback = new Map<string, string>();

function memoryStorage(): Storage {
  return {
    get length(): number {
      return memoryFallback.size;
    },
    clear: (): void => {
      memoryFallback.clear();
    },
    getItem: (key: string): string | null => memoryFallback.get(key) ?? null,
    key: (index: number): string | null => [...memoryFallback.keys()][index] ?? null,
    removeItem: (key: string): void => {
      memoryFallback.delete(key);
    },
    setItem: (key: string, value: string): void => {
      memoryFallback.set(key, value);
    }
  };
}

export interface CreatedIdentity {
  commitment: string;
  identityExport: string;
}

/**
 * Creates a fresh Semaphore identity. The trapdoor never leaves this
 * function except inside `identityExport`, which the caller must store
 * locally (demo only) — it is never sent to any server.
 */
export function createVotingIdentity(): CreatedIdentity & { identity: Identity } {
  const identity = new Identity();
  return { identity, commitment: identity.commitment.toString(), identityExport: identity.export() };
}

/** Restores an identity from a stored export; null only for unusable input. */
export function importVotingIdentity(identityExport: string): { identity: Identity; commitment: string } | null {
  try {
    if (!identityExport) return null;
    const identity = Identity.import(identityExport);
    return { identity, commitment: identity.commitment.toString() };
  } catch {
    return null;
  }
}

/**
 * Demo-only device storage for the identity export, keyed per election.
 * Lets a voter who registered during Registration phase cast their ballot
 * from the same device once Voting opens. Never synced anywhere.
 */
export function saveIdentityExport(electionId: string, identityExport: string): void {
  storage()?.setItem(`${STORAGE_PREFIX}${electionId}`, identityExport);
}

export function loadIdentityExport(electionId: string): string | null {
  return storage()?.getItem(`${STORAGE_PREFIX}${electionId}`) ?? null;
}

export function loadStoredCommitment(electionId: string): string | null {
  const exported = loadIdentityExport(electionId);
  if (!exported) return null;
  return importVotingIdentity(exported)?.commitment ?? null;
}

export function clearIdentityExport(electionId: string): void {
  storage()?.removeItem(`${STORAGE_PREFIX}${electionId}`);
}
