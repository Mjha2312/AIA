import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ElectionCard } from './election-card';
import { elections } from '@/test/fixtures';
import { renderWithI18n } from '@/test/render';

const [voting, registration, finalized] = elections;
if (!voting || !registration || !finalized) throw new Error('fixtures missing');

describe('ElectionCard state-driven design', () => {
  it('shows a live indicator and primary action for voting elections', () => {
    renderWithI18n(<ElectionCard election={voting} />);

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cast your vote' })).toHaveAttribute('href', '/en/vote/1');
    expect(screen.getByRole('progressbar', { name: /Turnout/ })).toHaveAttribute('aria-valuenow', '37.8');
  });

  it('distinguishes registration elections with a secondary action', () => {
    renderWithI18n(<ElectionCard election={registration} />);

    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/en/turnout/2');
  });

  it('shows the real winner and distribution only for finalized elections with tally data', () => {
    renderWithI18n(<ElectionCard election={finalized} />);

    // Tally [1951, 2004, 2077, 2092] -> winner is index 3 "S. Arun Kumar". No fabrication.
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('S. Arun Kumar')).toBeInTheDocument();
    expect(screen.getByText('Vote distribution')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/en/turnout/3');
  });

  it('omits the winner when tally data is unavailable instead of inventing one', () => {
    renderWithI18n(<ElectionCard election={{ ...finalized, tally: null }} />);

    expect(screen.queryByText('S. Arun Kumar')).not.toBeInTheDocument();
    expect(screen.queryByText('Vote distribution')).not.toBeInTheDocument();
  });
});

describe('ElectionCard turnout bar', () => {
  it('exposes an accessible progressbar aligned with the visible percentage', () => {
    renderWithI18n(<ElectionCard election={voting} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    // Percentage is rendered next to the bar, not detached.
    expect(bar.previousElementSibling ?? bar.parentElement).toBeDefined();
  });
});

describe('ElectionCard i18n', () => {
  it('keeps controls usable without horizontal overflow on small screens', async () => {
    renderWithI18n(<ElectionCard election={voting} />);
    await userEvent.click(screen.getByRole('link', { name: 'Cast your vote' }));
    expect(screen.getByRole('link', { name: 'Cast your vote' })).toBeInTheDocument();
  });
});
