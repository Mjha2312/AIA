import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BallotStep } from './ballot-step';
import { clearIdentityExport, createVotingIdentity, saveIdentityExport } from '@/lib/vote-identity';
import { jsonResponse, renderWithI18n } from '@/test/render';

vi.mock('@/lib/vote-proof', () => ({
  generateVoteProof: vi.fn(async (_identity: unknown, _members: string[], candidate: number) => ({
    proof: {
      merkleTreeDepth: '20',
      merkleTreeRoot: '111',
      nullifier: '999001',
      message: String(candidate),
      scope: '1',
      points: ['1', '2', '3', '4', '5', '6', '7', '8']
    },
    nullifier: '999001'
  })),
  groupHasCommitment: (members: string[], commitment: string): boolean =>
    members.includes(commitment)
}));

const fetchMock = vi.fn();
const candidates = ['Anitha R.', 'B. Suresh Kumar'];
const HASH = `0x${'ab'.repeat(32)}`;

function seedIdentity(electionId: string): string {
  const created = createVotingIdentity();
  saveIdentityExport(electionId, created.identityExport);
  return created.commitment;
}

describe('BallotStep', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    for (const id of ['10', '11', '12', '13', '14']) clearIdentityExport(id);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a candidate and enables casting on selection', async () => {
    const commitment = seedIdentity('10');
    fetchMock.mockResolvedValue(jsonResponse({ members: [commitment] }));
    renderWithI18n(<BallotStep electionId="10" candidates={candidates} onVoted={() => undefined} />);

    expect(await screen.findByRole('heading', { name: 'Choose your candidate' })).toBeInTheDocument();
    const cast = screen.getByRole('button', { name: 'Cast secret ballot' });
    expect(cast).toBeDisabled();

    await userEvent.click(screen.getByLabelText('B. Suresh Kumar'));
    expect(cast).toBeEnabled();
  });

  it('needs an identity on this device', async () => {
    renderWithI18n(<BallotStep electionId="11" candidates={candidates} onVoted={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No voting identity on this device');
  });

  it('waits for the ledger group instead of casting blindly', async () => {
    seedIdentity('12');
    fetchMock.mockResolvedValue(jsonResponse({ members: ['000'] }));
    renderWithI18n(<BallotStep electionId="12" candidates={candidates} onVoted={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('has not reached the ledger group');
    expect(screen.getByRole('button', { name: 'Cast secret ballot' })).toBeDisabled();
  });

  it('proves, relays and reports vote hash plus nullifier', async () => {
    const commitment = seedIdentity('13');
    const bodies: unknown[] = [];
    fetchMock.mockImplementation((url: unknown, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/group')) return Promise.resolve(jsonResponse({ members: [commitment] }));
      if (target.includes('/relay/vote')) {
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(jsonResponse({ txHash: HASH, voteHash: HASH }));
      }
      return Promise.reject(new Error(`unexpected fetch ${target}`));
    });
    const onVoted = vi.fn();
    renderWithI18n(<BallotStep electionId="13" candidates={candidates} onVoted={onVoted} />);

    await userEvent.click(await screen.findByLabelText('Anitha R.'));
    await userEvent.click(screen.getByRole('button', { name: 'Cast secret ballot' }));

    await waitFor(() =>
      expect(onVoted).toHaveBeenCalledWith({
        voteHash: HASH,
        txHash: HASH,
        nullifier: '999001',
        candidateIndex: 0
      })
    );
    const relay = bodies[0] as { proof: { points: unknown[]; message: string } };
    expect(relay.proof.points).toHaveLength(8);
    expect(relay.proof.message).toBe('0');
  });

  it('shows relay failures inline', async () => {
    const commitment = seedIdentity('14');
    fetchMock.mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.includes('/group')) return Promise.resolve(jsonResponse({ members: [commitment] }));
      return Promise.resolve(jsonResponse({ error: { code: 'WRONG_PHASE', message: 'closed' } }, 409));
    });
    renderWithI18n(<BallotStep electionId="14" candidates={candidates} onVoted={() => undefined} />);

    await userEvent.click(await screen.findByLabelText('Anitha R.'));
    await userEvent.click(screen.getByRole('button', { name: 'Cast secret ballot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('closed');
  });
});
