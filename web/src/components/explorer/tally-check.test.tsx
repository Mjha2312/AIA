import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TallyCheck } from './tally-check';
import { Phase } from '@/lib/phases';
import type { Election } from '@/lib/schemas';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();

function vote(candidateIndex: number, voteHash: string) {
  return {
    voteHash,
    nullifier: `nullifier-${voteHash}`,
    candidateIndex,
    txHash: `0x${'ab'.repeat(32)}`,
    blockNumber: 1,
    timestamp: 1_760_000_100
  };
}

function electionWithTally(tally: number[] | null): Election {
  return {
    id: '9',
    constituencyId: 'TEST-001 · Test Ward',
    candidates: ['Anitha R.', 'B. Suresh Kumar'],
    phase: tally == null ? Phase.Voting : Phase.Finalized,
    registeredCount: 10,
    votedCount: 3,
    turnoutPct: 30,
    tally
  };
}

describe('TallyCheck', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recounts every page and reports MATCH against the official tally', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('cursor=')) {
        return jsonResponse({ items: [vote(1, `0x${'03'.repeat(32)}`)], nextCursor: null });
      }
      return jsonResponse({
        items: [vote(0, `0x${'01'.repeat(32)}`), vote(0, `0x${'02'.repeat(32)}`)],
        nextCursor: '2'
      });
    });
    const user = userEvent.setup();

    renderWithI18n(<TallyCheck election={electionWithTally([2, 1])} />);
    await user.click(screen.getByRole('button', { name: 'Verify tally' }));

    expect(await screen.findByText(/MATCH — the browser recount equals/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports MISMATCH when the recount differs', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [vote(0, `0x${'01'.repeat(32)}`)], nextCursor: null })
    );
    const user = userEvent.setup();

    renderWithI18n(<TallyCheck election={electionWithTally([0, 1])} />);
    await user.click(screen.getByRole('button', { name: 'Verify tally' }));

    expect(await screen.findByText(/MISMATCH — the browser recount differs/)).toBeInTheDocument();
  });

  it('shows the recount as unofficial while the tally is still hidden', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [vote(0, `0x${'01'.repeat(32)}`)], nextCursor: null })
    );
    const user = userEvent.setup();

    renderWithI18n(<TallyCheck election={electionWithTally(null)} />);
    await user.click(screen.getByRole('button', { name: 'Verify tally' }));

    expect(await screen.findByText(/official tally is published/)).toBeInTheDocument();
  });

  it('offers a retry when fetching votes fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();

    renderWithI18n(<TallyCheck election={electionWithTally([1, 0])} />);
    await user.click(screen.getByRole('button', { name: 'Verify tally' }));

    expect(await screen.findByText(/could not fetch all votes/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument());
  });
});
