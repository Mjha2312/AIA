/** Raw chain log in provider-agnostic form. */
export interface ChainLog {
  address: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: Date | null;
  topics: string[];
  data: string;
}

export interface ElectionDetailsInput {
  constituencyId: string;
  candidates: string[];
}

export interface VoteRow {
  voteHash: string;
  electionId: string;
  nullifier: string;
  candidateIndex: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: Date | null;
}

export interface GroupMemberRow {
  electionId: string;
  identityCommitment: string;
  leafIndex: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
}

/** Read-model election row (domain Election + indexer counters). */
export interface ElectionRecord {
  electionId: string;
  constituencyId: string;
  candidates: string[];
  phase: number;
  registered: number;
  voted: number;
}

/** Stable pagination cursor over votes ordered by (blockNumber, logIndex). */
export interface VotesCursor {
  blockNumber: number;
  logIndex: number;
}

export interface AuditRun {
  id: number;
  electionId: string;
  evmTally: number[];
  chainTally: number[];
  match: boolean;
  createdAt: Date | null;
}

export interface TableCounts {
  elections: number;
  votes: number;
  members: number;
  phaseChanges: number;
  audits: number;
}
