/** Query keys kept in one place so invalidation cannot drift. */
export const queryKeys = {
  elections: ['elections'] as const,
  election: (electionId: string) => ['election', electionId] as const,
  turnout: (electionId: string) => ['turnout', electionId] as const,
  votes: (electionId: string) => ['votes', electionId] as const,
  group: (electionId: string) => ['group', electionId] as const,
  receipt: (nullifier: string) => ['receipt', nullifier] as const,
  audits: (electionId: string) => ['audits', electionId] as const
};