import { describe, expect, it, vi } from 'vitest';

import { generateVoteProof, groupHasCommitment, toWireProof } from './vote-proof';

vi.mock('@semaphore-protocol/proof', () => ({
  generateProof: vi.fn(async () => ({
    merkleTreeDepth: 20n,
    merkleTreeRoot: 111n,
    nullifier: 222n,
    message: 1n,
    scope: 7n,
    points: ['3', 4n, 5n, 6n, 7n, 8n, 9n, 10n]
  }))
}));

describe('toWireProof', () => {
  it('serialises every field to decimal strings', () => {
    const wire = toWireProof({
      merkleTreeDepth: 20,
      merkleTreeRoot: '111',
      nullifier: '222',
      message: '1',
      scope: '7',
      points: ['3', '4', '5', '6', '7', '8', '9', '10']
    });

    expect(wire).toEqual({
      merkleTreeDepth: '20',
      merkleTreeRoot: '111',
      nullifier: '222',
      message: '1',
      scope: '7',
      points: ['3', '4', '5', '6', '7', '8', '9', '10']
    });
  });
});

describe('generateVoteProof', () => {
  it('returns the wire proof plus the receipt nullifier', async () => {
    const { proof, nullifier } = await generateVoteProof(
      { commitment: 999n } as never,
      ['999', '1000'],
      1,
      '7'
    );

    expect(proof.points).toHaveLength(8);
    expect(proof.message).toBe('1');
    expect(proof.scope).toBe('7');
    expect(nullifier).toBe(proof.nullifier);
  });
});

describe('groupHasCommitment', () => {
  it('compares numerically across encodings', () => {
    expect(groupHasCommitment(['15', '16'], '15')).toBe(true);
    expect(groupHasCommitment(['0xf', '16'], '15')).toBe(true);
    expect(groupHasCommitment(['16'], '15')).toBe(false);
    expect(groupHasCommitment(['16'], 'garbage')).toBe(false);
    expect(groupHasCommitment(['garbage'], '15')).toBe(false);
  });
});
