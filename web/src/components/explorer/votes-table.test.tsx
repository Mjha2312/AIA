import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VotesTable } from './votes-table';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();
const HASH = `0x${'ab'.repeat(32)}`;
const candidates = ['Anitha R.', 'B. Suresh Kumar'];

function votesPage() {
  return {
    items: [
      {
        voteHash: HASH,
        nullifier: 'null-1',
        candidateIndex: 0,
        txHash: HASH,
        blockNumber: 1_000_001,
        timestamp: 1_760_000_012
      }
    ],
    nextCursor: null
  };
}

describe('VotesTable', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries the ledger fetch in place without a full page reload', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse(votesPage()));

    renderWithI18n(<VotesTable electionId="1" candidates={candidates} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load votes');
    const callsBefore = fetchMock.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // A second ledger request fires and the vote renders — the page itself
    // never reloaded (no window.location.reload in this component).
    expect(await screen.findByText('Anitha R.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('renders a loading state first, then streams rows in', async () => {
    fetchMock.mockResolvedValue(jsonResponse(votesPage()));

    renderWithI18n(<VotesTable electionId="1" candidates={candidates} />);

    // The loading state renders from the first paint, before the ledger
    // responds — the fetch never blocks the initial render…
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // …and rows stream in when the ledger responds.
    expect(await screen.findByText('Anitha R.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search loaded votes by nullifier or vote hash')).toBeInTheDocument();
  });
});
