import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { VoteFlow } from './vote-flow';
import { elections } from '@/test/fixtures';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();

const votingElection = elections[0];
const registrationElection = elections[1];
const finalizedElection = elections[2];
if (!votingElection || !registrationElection || !finalizedElection) {
  throw new Error('test fixtures are missing an election');
}

describe('VoteFlow', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('announces loading instead of a blank screen', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    renderWithI18n(<VoteFlow electionId="1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading election…');
  });

  it('shows the ballot candidates when voting is open', async () => {
    fetchMock.mockResolvedValue(jsonResponse(votingElection));

    renderWithI18n(<VoteFlow electionId="1" />);

    expect(await screen.findByRole('heading', { name: /Cast your vote/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your ballot' })).toBeInTheDocument();
    for (const candidate of votingElection.candidates) {
      expect(screen.getByText(candidate)).toBeInTheDocument();
    }
  });

  it('explains registration-phase elections and hides the ballot', async () => {
    fetchMock.mockResolvedValue(jsonResponse(registrationElection));

    renderWithI18n(<VoteFlow electionId="2" />);

    expect(await screen.findByRole('heading', { name: 'Registration is open' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your ballot' })).not.toBeInTheDocument();
  });

  it('points finalized elections at turnout', async () => {
    fetchMock.mockResolvedValue(jsonResponse(finalizedElection));

    renderWithI18n(<VoteFlow electionId="3" />);

    expect(await screen.findByRole('heading', { name: 'Voting is not open' })).toBeInTheDocument();
    expect(screen.getByText(/Finalized/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View turnout' })).toHaveAttribute(
      'href',
      '/en/turnout/3'
    );
  });

  it('reports unknown elections and retries on failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'x', message: 'gone' } }, 404))
      .mockResolvedValueOnce(jsonResponse(votingElection));

    renderWithI18n(<VoteFlow electionId="9" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not find what you were looking for.'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Your ballot' })).toBeInTheDocument();
  });
});
