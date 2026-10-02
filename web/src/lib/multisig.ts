import { decodeFunctionData, parseAbi, type Hex } from 'viem';

import { Phase, phaseMessageKey } from './phases';

/**
 * Human-readable decoding of `ECIMultiSig` pending transactions.
 *
 * Pure and dependency-free apart from viem's ABI codec: given the multisig
 * `transactions(txId)` tuple and the known `ElectionManager` address, it
 * explains what executing the transaction would do. Anything it cannot
 * understand is reported as `unknown` rather than guessed at.
 */

const electionManagerCalls = parseAbi([
  'function createElection(string constituencyId, string[] candidates) returns (uint256)',
  'function advancePhase(uint256 electionId)'
]);

export type DecodedMultisigAction =
  | { kind: 'createElection'; constituencyId: string; candidates: string[] }
  | { kind: 'advancePhase'; electionId: string }
  | { kind: 'unknown'; target: string; selector: string | null };

export interface MultisigTransaction {
  target: string;
  data: string;
  approvals: bigint | number;
  executed: boolean;
}

export function decodeMultisigAction(
  transaction: Pick<MultisigTransaction, 'target' | 'data'>,
  electionManagerAddress: string
): DecodedMultisigAction {
  if (transaction.target.toLowerCase() !== electionManagerAddress.toLowerCase()) {
    return { kind: 'unknown', target: transaction.target, selector: selectorOf(transaction.data) };
  }
  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: electionManagerCalls, data: transaction.data as Hex });
  } catch {
    return { kind: 'unknown', target: transaction.target, selector: selectorOf(transaction.data) };
  }
  if (decoded.functionName === 'createElection') {
    const [constituencyId, candidates] = decoded.args as [string, string[]];
    return { kind: 'createElection', constituencyId, candidates: [...candidates] };
  }
  if (decoded.functionName === 'advancePhase') {
    const [electionId] = decoded.args as [bigint];
    return { kind: 'advancePhase', electionId: electionId.toString() };
  }
  return { kind: 'unknown', target: transaction.target, selector: selectorOf(transaction.data) };
}

function selectorOf(data: string): string | null {
  return data.startsWith('0x') && data.length >= 10 ? data.slice(0, 10) : null;
}

export type ActionDescriptionKey =
  | 'txCreateElection'
  | 'txAdvancePhase'
  | 'txAdvancePhaseBare'
  | 'txUnknown';

export interface ActionDescription {
  key: ActionDescriptionKey;
  values: Record<string, string | number>;
}

export interface ElectionContext {
  constituencyId: string;
  phase: Phase;
}

/**
 * Localised description of a decoded action. Needs the election the action
 * targets (for constituency + phase names); without it the description falls
 * back to raw ids. `from`/`to` are `phases.*` message-key suffixes (e.g.
 * `"voting"`) — the component translates them with the shared phase names so
 * every language reuses one vocabulary.
 */
export function describeMultisigAction(
  action: DecodedMultisigAction,
  electionsById?: Map<string, ElectionContext>
): ActionDescription {
  if (action.kind === 'createElection') {
    return {
      key: 'txCreateElection',
      values: { constituency: action.constituencyId, count: action.candidates.length }
    };
  }
  if (action.kind === 'advancePhase') {
    const election = electionsById?.get(action.electionId);
    if (!election) {
      return { key: 'txAdvancePhaseBare', values: { election: action.electionId } };
    }
    return {
      key: 'txAdvancePhase',
      values: {
        constituency: election.constituencyId,
        from: phaseMessageKey(election.phase),
        to: phaseMessageKey(Math.min(election.phase + 1, Phase.Finalized) as Phase)
      }
    };
  }
  return { key: 'txUnknown', values: { target: action.target } };
}
