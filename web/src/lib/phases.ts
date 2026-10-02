/**
 * Election phases. SPEC: `Setup=0, Registration=1, Voting=2, Tallying=3, Finalized=4`.
 */
export const Phase = {
  Setup: 0,
  Registration: 1,
  Voting: 2,
  Tallying: 3,
  Finalized: 4
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

export const PHASE_NAMES = ['Setup', 'Registration', 'Voting', 'Tallying', 'Finalized'] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

/** Keys under `phases.*` in the message files. */
export const PHASE_MESSAGE_KEYS = {
  Setup: 'setup',
  Registration: 'registration',
  Voting: 'voting',
  Tallying: 'tallying',
  Finalized: 'finalized'
} as const;

export type PhaseMessageKey = (typeof PHASE_MESSAGE_KEYS)[PhaseName];

export function phaseName(phase: Phase): PhaseName {
  return PHASE_NAMES[phase] ?? 'Setup';
}

export function phaseMessageKey(phase: Phase): PhaseMessageKey {
  return PHASE_MESSAGE_KEYS[phaseName(phase)];
}

export function isPhaseAtLeast(phase: Phase, phase2: Phase): boolean {
  return phase >= phase2;
}

/** Phases in which a voter may still cast a ballot. */
export function isVotingOpen(phase: Phase): boolean {
  return phase === Phase.Voting;
}