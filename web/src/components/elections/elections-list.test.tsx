import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectionsList } from './elections-list';
import { elections } from '@/test/fixtures';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();

describe('ElectionsList', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains what it is loading instead of showing a blank screen', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    renderWithI18n(<ElectionsList />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading elections…');
  });

  it('renders one card per election with constituency, phase badge and turnout', async () => {
    fetchMock.mockResolvedValue(jsonResponse(elections));

    renderWithI18n(<ElectionsList />);

    const list = await screen.findByRole('list', { name: undefined });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));

    expect(screen.getByRole('heading', { name: 'Elections', level: 2 })).toBeInTheDocument();

    expect(screen.getByText('KA-001 · Bengaluru North East')).toBeInTheDocument();
    expect(screen.getByText('MH-014 · Pune Sadashiv Nagar')).toBeInTheDocument();
    expect(screen.getByText('TN-021 · Chennai Central')).toBeInTheDocument();

    expect(screen.getAllByTestId('phase-badge').map((badge) => badge.textContent)).toEqual([
      'Voting',
      'Registration',
      'Finalized'
    ]);

    expect(screen.getByText('37.8%')).toBeInTheDocument();
    expect(screen.getByText('82.9%')).toBeInTheDocument();
    expect(screen.getByText('12,400')).toBeInTheDocument();
    expect(screen.getByText('5 candidates')).toBeInTheDocument();
  });

  it('sends the voter to the ballot for a live election and to turnout otherwise', async () => {
    fetchMock.mockResolvedValue(jsonResponse(elections));

    renderWithI18n(<ElectionsList />);

    const castVote = await screen.findAllByRole('link', { name: 'Cast your vote' });
    expect(castVote[0]).toHaveAttribute('href', '/en/vote/1');

    const viewDetails = screen.getAllByRole('link', { name: 'View details' });
    expect(viewDetails[0]).toHaveAttribute('href', '/en/turnout/2');
    expect(viewDetails[1]).toHaveAttribute('href', '/en/turnout/3');
  });

  it('shows an empty state when no election has been published', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    renderWithI18n(<ElectionsList />);

    expect(await screen.findByText('No elections have been published yet.')).toBeInTheDocument();
  });

  it('explains a failure and retries on request', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(jsonResponse(elections));

    renderWithI18n(<ElectionsList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the election list');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('KA-001 · Bengaluru North East')).toBeInTheDocument();
  });

  it('reports a malformed backend payload instead of crashing', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1, constituencyId: 'broken' }]));

    renderWithI18n(<ElectionsList />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});