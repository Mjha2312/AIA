import { encodeFunctionData, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';

import { Phase } from './phases';
import { decodeMultisigAction, describeMultisigAction } from './multisig';

const EM = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
const OTHER = '0x0000000000000000000000000000000000000001';

const calls = parseAbi([
  'function createElection(string constituencyId, string[] candidates) returns (uint256)',
  'function advancePhase(uint256 electionId)'
]);

describe('decodeMultisigAction', () => {
  it('decodes createElection with constituency and candidates', () => {
    const data = encodeFunctionData({
      abi: calls,
      functionName: 'createElection',
      args: ['KA-002 · Test Ward', ['Alice', 'Bob']]
    });
    expect(decodeMultisigAction({ target: EM, data }, EM)).toEqual({
      kind: 'createElection',
      constituencyId: 'KA-002 · Test Ward',
      candidates: ['Alice', 'Bob']
    });
  });

  it('decodes advancePhase with a string election id', () => {
    const data = encodeFunctionData({ abi: calls, functionName: 'advancePhase', args: [7n] });
    expect(decodeMultisigAction({ target: EM, data }, EM)).toEqual({
      kind: 'advancePhase',
      electionId: '7'
    });
  });

  it('matches the manager address case-insensitively', () => {
    const data = encodeFunctionData({ abi: calls, functionName: 'advancePhase', args: [1n] });
    expect(decodeMultisigAction({ target: EM.toLowerCase(), data }, EM.toUpperCase())).toEqual({
      kind: 'advancePhase',
      electionId: '1'
    });
  });

  it('reports calls to other contracts as unknown', () => {
    const data = encodeFunctionData({ abi: calls, functionName: 'advancePhase', args: [1n] });
    expect(decodeMultisigAction({ target: OTHER, data }, EM)).toEqual({
      kind: 'unknown',
      target: OTHER,
      selector: data.slice(0, 10)
    });
  });

  it('reports undecodable calldata as unknown with its selector', () => {
    expect(decodeMultisigAction({ target: EM, data: '0xdeadbeef' }, EM)).toEqual({
      kind: 'unknown',
      target: EM,
      selector: '0xdeadbeef'
    });
  });

  it('handles malformed calldata without throwing', () => {
    expect(decodeMultisigAction({ target: EM, data: 'not-hex' }, EM)).toEqual({
      kind: 'unknown',
      target: EM,
      selector: null
    });
  });
});

describe('describeMultisigAction', () => {
  it('describes election creation with constituency and candidate count', () => {
    expect(
      describeMultisigAction({ kind: 'createElection', constituencyId: 'KA-002', candidates: ['A', 'B', 'C'] })
    ).toEqual({ key: 'txCreateElection', values: { constituency: 'KA-002', count: 3 } });
  });

  it('describes a phase advance with translated phase keys', () => {
    expect(
      describeMultisigAction(
        { kind: 'advancePhase', electionId: '12' },
        new Map([['12', { constituencyId: 'Ward 12', phase: Phase.Voting }]])
      )
    ).toEqual({
      key: 'txAdvancePhase',
      values: { constituency: 'Ward 12', from: 'voting', to: 'tallying' }
    });
  });

  it('clamps the "to" phase at Finalized', () => {
    expect(
      describeMultisigAction(
        { kind: 'advancePhase', electionId: '3' },
        new Map([['3', { constituencyId: 'Done Ward', phase: Phase.Finalized }]])
      )
    ).toEqual({
      key: 'txAdvancePhase',
      values: { constituency: 'Done Ward', from: 'finalized', to: 'finalized' }
    });
  });

  it('falls back to the raw election id without election context', () => {
    expect(describeMultisigAction({ kind: 'advancePhase', electionId: '99' })).toEqual({
      key: 'txAdvancePhaseBare',
      values: { election: '99' }
    });
  });

  it('describes unknown calls with the target address', () => {
    expect(
      describeMultisigAction({ kind: 'unknown', target: OTHER, selector: '0xdeadbeef' })
    ).toEqual({ key: 'txUnknown', values: { target: OTHER } });
  });
});
