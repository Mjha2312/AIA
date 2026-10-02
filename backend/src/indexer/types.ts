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
