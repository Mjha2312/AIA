import type { Interface } from "ethers";

/** API-facing mapping for a chain revert / relay failure. */
export interface ChainErrorMapping {
  status: number;
  code: string;
  message: string;
}

/** Thrown when a submitted vote tx is not mined within RELAY_TX_TIMEOUT_MS. */
export class TxTimeoutError extends Error {
  constructor(public readonly txHash: string) {
    super(`Transaction ${txHash} was not mined in time`);
    this.name = "TxTimeoutError";
  }
}

/**
 * Build a realistic CALL_EXCEPTION-style error for a named custom error.
 * Used by fakes so tests exercise the real decode path (no string matching).
 */
export function revertErrorForName(iface: Interface, errorName: string): Error {
  const data = iface.encodeErrorResult(errorName, []);
  return Object.assign(new Error(`reverted with ${errorName}`), {
    code: "CALL_EXCEPTION",
    data,
  });
}

function mapRevertName(name: string | undefined): ChainErrorMapping | null {
  switch (name) {
    case "ElectionNotFound":
      return { status: 404, code: "ELECTION_NOT_FOUND", message: "Election does not exist" };
    case "WrongPhase":
      return { status: 409, code: "WRONG_PHASE", message: "Election is not in Voting phase" };
    case "InvalidCandidate":
      return { status: 400, code: "INVALID_CANDIDATE", message: "candidateIndex is out of range" };
    case "ScopeMismatch":
      return { status: 400, code: "SCOPE_MISMATCH", message: "Proof scope must equal the electionId" };
    case "MessageMismatch":
      return {
        status: 400,
        code: "MESSAGE_MISMATCH",
        message: "Proof message must equal the candidateIndex",
      };
    case "Semaphore__YouAreUsingTheSameNullifierTwice":
      return {
        status: 409,
        code: "ALREADY_VOTED",
        message: "This vote was already counted (nullifier already used)",
      };
    case "Semaphore__InvalidProof":
    case "Semaphore__MerkleTreeRootIsNotPartOfTheGroup":
    case "Semaphore__MerkleTreeRootIsExpired":
    case "Semaphore__MerkleTreeDepthIsNotSupported":
    case "Semaphore__GroupDoesNotExist":
    case "Semaphore__GroupHasNoMembers":
    case "LeafAlreadyExists":
    case "LeafCannotBeZero":
    case "LeafDoesNotExist":
    case "LeafGreaterThanSnarkScalarField":
    case "WrongSiblingNodes":
      return { status: 400, code: "INVALID_PROOF", message: "Semaphore proof failed validation" };
    default:
      return null;
  }
}

function extractRevertData(err: unknown): string | undefined {
  // ethers v6 nests revert data at various depths depending on the call path.
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const rec = current as Record<string, unknown>;
    if (typeof rec.data === "string" && rec.data.startsWith("0x")) return rec.data;
    current = rec.error ?? rec.info;
  }
  return undefined;
}

/**
 * Map an ethers failure from relaying castVote to a clean API error.
 * Known contract custom errors get precise codes; everything else is a 502.
 */
export function mapRelayChainError(err: unknown, iface: Interface): ChainErrorMapping {
  if (err instanceof TxTimeoutError) {
    return {
      status: 504,
      code: "TX_TIMEOUT",
      message: `Vote transaction ${err.txHash} was not mined in time; check its status by nullifier before retrying`,
    };
  }
  const data = extractRevertData(err);
  if (data) {
    try {
      const decoded = iface.parseError(data);
      const mapped = mapRevertName(decoded?.name);
      if (mapped) return mapped;
    } catch {
      // Unparseable revert data — fall through to generic mapping.
    }
  }
  if (err instanceof Error) {
    if (err.message.includes("insufficient funds")) {
      return { status: 502, code: "CHAIN_ERROR", message: "Relayer wallet has insufficient funds" };
    }
    if (err.message.includes("TIMEOUT") || err.message.includes("timeout")) {
      return { status: 504, code: "TX_TIMEOUT", message: "Chain request timed out; check vote status before retrying" };
    }
  }
  return { status: 502, code: "CHAIN_ERROR", message: "On-chain vote submission failed" };
}

/** True for errors that mean our locally-tracked nonce is stale. */
export function isNonceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = `${err.message} ${(err as { code?: unknown }).code ?? ""} ${(err as { reason?: unknown }).reason ?? ""}`;
  return (
    msg.includes("NONCE_EXPIRED") ||
    msg.includes("nonce has already been used") ||
    msg.includes("nonce too low") ||
    msg.includes("replacement transaction underpriced") ||
    msg.includes("already known")
  );
}
