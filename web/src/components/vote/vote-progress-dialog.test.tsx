import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VoteProgressDialog } from './vote-progress-dialog';
import { renderWithI18n } from '@/test/render';

describe('VoteProgressDialog', () => {
  it('shows proof generation as the active honest step', () => {
    renderWithI18n(
      <VoteProgressDialog status="proving" error={null} onClose={() => undefined} onRetry={() => undefined} />
    );

    expect(screen.getByRole('dialog', { name: 'Casting your vote' })).toBeInTheDocument();
    expect(screen.getByText('Generating ZK proof')).toBeInTheDocument();
    expect(screen.getByText('Creating a private proof that your vote is valid.')).toBeInTheDocument();
    // Ledger step is still pending — never claims confirmation early.
    expect(screen.getByText('Writing to ledger')).toBeInTheDocument();
    expect(screen.queryByText('Vote confirmed')).toBeInTheDocument();
  });

  it('marks confirmation only on the done state', () => {
    renderWithI18n(
      <VoteProgressDialog status="done" error={null} onClose={() => undefined} onRetry={() => undefined} />
    );

    expect(screen.getByText('Your vote has been recorded and can be independently verified.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look up receipt' })).toBeInTheDocument();
  });

  it('surfaces failures with retry without claiming confirmation', async () => {
    const onRetry = vi.fn();
    renderWithI18n(
      <VoteProgressDialog status="error" error="Voting is not open for this election." onClose={() => undefined} onRetry={onRetry} />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Voting is not open');
    expect(screen.queryByRole('button', { name: 'Look up receipt' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('announces step changes through a live region', () => {
    renderWithI18n(
      <VoteProgressDialog status="relaying" error={null} onClose={() => undefined} onRetry={() => undefined} />
    );

    // ol carries aria-live=polite so screen readers follow proving -> relaying.
    const list = screen.getByRole('list', { name: 'Casting your vote' });
    expect(list).toHaveAttribute('aria-live', 'polite');
  });
});
