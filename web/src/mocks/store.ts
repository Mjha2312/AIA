import { createHash } from 'node:crypto';

import { Phase, phaseName } from '@/lib/phases';
import type { ChainEvent, Receipt, Vote } from '@/lib/schemas';

/**
 * In-memory stand-in for the backend, so the frontend can be developed with
 * nothing else running (`NEXT_PUBLIC_USE_MOCKS=true`).
 *
 * Everything here is synthetic: no Aadhaar numbers, no PII, no real elector
 * data. SPEC privacy rules (DPDP) still shape the shape of the data — a mock
 * voter is only ever an index, and receipts are keyed by nullifier.
 *
 * Deterministic on purpose: a seeded PRNG keeps lists stable between server
 * render and hydration, and the same mock answers the same request identically.
 */

const VOTING_ELECTION_INDEX = 0;
const REGISTRATION_ELECTION_INDEX = 1;
const SIMULATION_INTERVAL_MS = 2500;
const VOTES_PAGE_SIZE = 25;

interface ElectionSeed {
  constituencyId: string;
  candidates: string[];
  phase: Phase;
  registeredCount: number;
  votedCount: number;
}

const SEEDS: ElectionSeed[] = [
  {
    constituencyId: 'KA-001 · Bengaluru North East',
    candidates: ['Anitha R.', 'B. Suresh Kumar', 'Farida Qureshi', 'Gururaj P.', 'N. Vinod Singh'],
    phase: Phase.Voting,
    registeredCount: 12_400,
    votedCount: 4_683
  },
  {
    constituencyId: 'MH-014 · Pune Sadashiv Nagar',
    candidates: ['Meera Joshi', 'Rakesh Yadav', 'Sana Ansari'],
    phase: Phase.Registration,
    registeredCount: 486,
    votedCount: 0
  },
  {
    constituencyId: 'TN-021 · Chennai Central',
    candidates: ['Karthik Raman', 'Lakshmi Iyer', 'Priya Nair', 'S. Arun Kumar'],
    phase: Phase.Finalized,
    registeredCount: 9_802,
    votedCount: 8_124
  }
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = mulberry32(0xa1a70e);

/** Stand-in for keccak256 in the mock chain. */
function hashHex(parts: (string | number)[]): string {
  return `0x${createHash('sha256').update(parts.join(':')).digest('hex')}`;
}

export interface MockElection {
  id: string;
  constituencyId: string;
  candidates: string[];
  phase: Phase;
  registeredCount: number;
  votedCount: number;
}

export type MockResult<T> = { ok: true; value: T } | { ok: false; error: string; message: string };

interface StoredEvent {
  index: number;
  event: ChainEvent;
}

interface MockStore {
  elections: MockElection[];
  votes: Map<string, Vote[]>;
  receipts: Map<string, Receipt>;
  events: StoredEvent[];
  kycSessions: Map<string, string>;
  nextNullifierSeq: number;
  simulationStep: number;
  lastSimulatedAt: number;
}

const store: MockStore = {
  elections: SEEDS.map((seed, index) => ({
    id: String(index + 1),
    constituencyId: seed.constituencyId,
    candidates: seed.candidates,
    phase: seed.phase,
    registeredCount: seed.registeredCount,
    votedCount: seed.votedCount
  })),
  votes: new Map(),
  receipts: new Map(),
  events: [],
  kycSessions: new Map(),
  nextNullifierSeq: 0,
  simulationStep: 0,
  lastSimulatedAt: 0
};

function nextNullifier(electionId: string): string {
  store.nextNullifierSeq += 1;
  return hashHex(['nullifier', electionId, store.nextNullifierSeq]);
}

function pushEvent(event: ChainEvent): void {
  store.events.push({ index: store.events.length, event });
}

function buildVote(election: MockElection, index: number): Vote {
  const nullifier = nextNullifier(election.id);
  const candidateIndex = Math.floor(random() * election.candidates.length);
  return {
    voteHash: hashHex([election.id, nullifier, candidateIndex]),
    nullifier,
    candidateIndex,
    txHash: hashHex(['tx', election.id, index]),
    blockNumber: 1_000_000 + index,
    timestamp: 1_760_000_000 + index * 12
  };
}

function votesFor(electionId: string): Vote[] {
  const existing = store.votes.get(electionId);
  if (existing) return existing;

  const election = store.elections.find((entry) => entry.id === electionId);
  if (!election) return [];

  const votes = Array.from({ length: election.votedCount }, (_, index) => buildVote(election, index));
  for (const vote of votes) {
    store.receipts.set(vote.nullifier, {
      found: true,
      voteHash: vote.voteHash,
      txHash: vote.txHash,
      blockNumber: vote.blockNumber,
      timestamp: vote.timestamp
    });
  }
  store.votes.set(electionId, votes);
  return votes;
}

function seedEvents(): void {
  for (const election of store.elections) {
    pushEvent({ type: 'PhaseChanged', electionId: election.id, newPhase: election.phase });
  }
  const registration = store.elections[REGISTRATION_ELECTION_INDEX];
  if (registration) {
    for (let index = 0; index < 3; index += 1) {
      pushEvent({
        type: 'VoterRegistered',
        electionId: registration.id,
        identityCommitment: hashHex(['identityCommitment', registration.id, index])
      });
    }
  }
}

seedEvents();

function tallyFor(election: MockElection): number[] {
  const votes = votesFor(election.id);
  const tally = election.candidates.map(() => 0);
  for (const vote of votes) {
    const index = vote.candidateIndex % election.candidates.length;
    tally[index] = (tally[index] ?? 0) + 1;
  }
  return tally;
}

function turnoutPct(election: MockElection): number {
  if (election.registeredCount === 0) return 0;
  return Math.round((election.votedCount / election.registeredCount) * 1000) / 10;
}

export const mockApi = {
  listElections() {
    return store.elections.map((election) => ({
      ...election,
      turnoutPct: turnoutPct(election)
    }));
  },

  getElection(electionId: string) {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;
    const response = {
      ...election,
      turnoutPct: turnoutPct(election),
      tally: election.phase >= Phase.Tallying ? tallyFor(election) : null
    };
    return response;
  },

  getTurnout(electionId: string) {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;
    return {
      registered: election.registeredCount,
      voted: election.votedCount,
      turnoutPct: turnoutPct(election)
    };
  },

  getVotes(electionId: string, cursor?: string, limit?: number) {
    if (!store.elections.some((entry) => entry.id === electionId)) return null;
    const votes = votesFor(electionId);
    const start = cursor ? Number(cursor) : 0;
    const size = limit && limit > 0 ? Math.min(limit, VOTES_PAGE_SIZE) : VOTES_PAGE_SIZE;
    const items = votes.slice(start, start + size);
    const nextIndex = start + items.length;
    return {
      items,
      nextCursor: nextIndex < votes.length ? String(nextIndex) : null
    };
  },

  getGroup(electionId: string) {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;
    // Only the members of the Semaphore group, never voter identity data.
    const count = Math.min(election.registeredCount, 500);
    return {
      members: Array.from({ length: count }, (_, index) => hashHex(['identityCommitment', electionId, index]))
    };
  },

  getReceipt(nullifier: string): Receipt {
    return (
      store.receipts.get(nullifier) ?? {
        found: false,
        voteHash: null,
        txHash: null,
        blockNumber: null,
        timestamp: null
      }
    );
  },

  startKyc(electionId: string) {
    if (!store.elections.some((entry) => entry.id === electionId)) return null;
    const sessionId = `mock-kyc-${store.kycSessions.size + 1}`;
    store.kycSessions.set(sessionId, electionId);
    return {
      sessionId,
      // Stands in for the DigiLocker consent screen.
      redirectUrl: `/api-mock/api/kyc/mock-provider?session=${encodeURIComponent(sessionId)}`
    };
  },

  completeKyc(sessionId: string) {
    const electionId = store.kycSessions.get(sessionId);
    if (!electionId) return null;
    return { kycToken: `mock.jwt.${hashHex(['kycToken', sessionId, electionId]).slice(2, 34)}` };
  },

  register(electionId: string, identityCommitment: string): MockResult<{ txHash: string }> | null {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;
    if (election.phase !== Phase.Registration) {
      return { ok: false, error: 'wrong_phase', message: 'Voter registration is closed.' };
    }
    election.registeredCount += 1;
    pushEvent({ type: 'VoterRegistered', electionId, identityCommitment });
    return { ok: true, value: { txHash: hashHex(['tx', 'register', electionId, identityCommitment]) } };
  },

  relayVote(electionId: string, candidateIndex: number): MockResult<{ txHash: string; voteHash: string; nullifier: string }> | null {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;
    if (election.phase !== Phase.Voting) {
      return { ok: false, error: 'wrong_phase', message: 'Voting is not open for this election.' };
    }
    if (candidateIndex < 0 || candidateIndex >= election.candidates.length) {
      return { ok: false, error: 'invalid_candidate', message: 'candidateIndex is out of range for this election.' };
    }

    const votes = votesFor(electionId);
    const vote: Vote = {
      voteHash: hashHex([electionId, 'pending', candidateIndex, votes.length]),
      nullifier: nextNullifier(electionId),
      candidateIndex,
      txHash: hashHex(['tx', electionId, 'relay', votes.length]),
      blockNumber: 1_000_000 + votes.length,
      timestamp: 1_760_000_000 + votes.length * 12
    };
    votes.push(vote);
    election.votedCount += 1;
    store.receipts.set(vote.nullifier, {
      found: true,
      voteHash: vote.voteHash,
      txHash: vote.txHash,
      blockNumber: vote.blockNumber,
      timestamp: vote.timestamp
    });
    pushEvent({ type: 'VoteCast', electionId, nullifier: vote.nullifier, candidateIndex });
    return { ok: true, value: { txHash: vote.txHash, voteHash: vote.voteHash, nullifier: vote.nullifier } };
  },

  audit(electionId: string, booths: { boothId: string; counts: number[] }[]) {
    const election = store.elections.find((entry) => entry.id === electionId);
    if (!election) return null;

    const chainTally = tallyFor(election);
    const evmTally = election.candidates.map(() => 0);
    for (const booth of booths) {
      booth.counts.forEach((count, index) => {
        if (index < evmTally.length) evmTally[index] = (evmTally[index] ?? 0) + count;
      });
    }
    const diff = chainTally.map((count, index) => count - (evmTally[index] ?? 0));
    return { match: diff.every((value) => value === 0), chainTally, evmTally, diff };
  },

  /**
   * Mock stand-in for `WebSocket /ws`. Nudges one synthetic vote per interval so
   * live turnout visibly moves while working without a backend.
   */
  pollEvents(electionId: string | undefined, since: number) {
    simulate();
    const events = store.events
      .filter((stored) => stored.index >= since)
      .filter((stored) => !electionId || stored.event.electionId === electionId)
      .map((stored) => stored.event);
    return { cursor: store.events.length, events };
  },

  /** Nullifier of a known mock vote, handy for demos of the receipt lookup. */
  demoNullifier(): string {
    const election = store.elections[VOTING_ELECTION_INDEX];
    if (!election) return '';
    return votesFor(election.id)[0]?.nullifier ?? '';
  },

  phaseLabel: phaseName
};

function simulate(): void {
  const now = Date.now();
  if (now - store.lastSimulatedAt < SIMULATION_INTERVAL_MS) return;
  store.lastSimulatedAt = now;
  store.simulationStep += 1;

  const voting = store.elections[VOTING_ELECTION_INDEX];
  if (voting && voting.phase === Phase.Voting && store.simulationStep % 2 === 0) {
    const votes = votesFor(voting.id);
    const candidateIndex = Math.floor(random() * voting.candidates.length);
    const nullifier = nextNullifier(voting.id);
    votes.push({
      voteHash: hashHex([voting.id, nullifier, candidateIndex]),
      nullifier,
      candidateIndex,
      txHash: hashHex(['tx', voting.id, votes.length]),
      blockNumber: 1_000_000 + votes.length,
      timestamp: 1_760_000_000 + votes.length * 12
    });
    voting.votedCount += 1;
    store.receipts.set(nullifier, {
      found: true,
      voteHash: votes[votes.length - 1]?.voteHash ?? null,
      txHash: votes[votes.length - 1]?.txHash ?? null,
      blockNumber: votes[votes.length - 1]?.blockNumber ?? null,
      timestamp: votes[votes.length - 1]?.timestamp ?? null
    });
    pushEvent({ type: 'VoteCast', electionId: voting.id, nullifier, candidateIndex });
  }

  const registration = store.elections[REGISTRATION_ELECTION_INDEX];
  if (registration && store.simulationStep % 7 === 0) {
    const commitment = hashHex(['identityCommitment', registration.id, store.simulationStep]);
    registration.registeredCount += 1;
    pushEvent({ type: 'VoterRegistered', electionId: registration.id, identityCommitment: commitment });
  }
}