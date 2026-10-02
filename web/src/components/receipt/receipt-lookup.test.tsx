import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReceiptLookup } from './receipt-lookup';
import { jsonResponse, renderWithI18n } from '@/test/render';

const fetchMock = vi.fn();
const HASH = `0x${'cd'.repeat(32)}`;

describe('ReceiptLookup', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not query until a nullifier is submitted', async () => {
    renderWithI18n(<ReceiptLookup />);

    await userEvent.click(screen.getByRole('button', { name: 'Look up receipt' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows vote details for a known nullifier', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ found: true, voteHash: HASH, txHash: HASH, blockNumber: 42, timestamp: 1_760_000_000 })
    );
    renderWithI18n(<ReceiptLookup />);

    await userEvent.type(screen.getByLabelText('Nullifier'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Look up receipt' }));

    expect(await screen.findByText('Vote hash')).toBeInTheDocument();
    expect(screen.getAllByText(HASH)).toHaveLength(2);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('explains unknown nullifiers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ found: false, voteHash: null, txHash: null, blockNumber: null, timestamp: null })
    );
    renderWithI18n(<ReceiptLookup />);

    await userEvent.type(screen.getByLabelText('Nullifier'), '000');
    await userEvent.click(screen.getByRole('button', { name: 'Look up receipt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No vote found for this nullifier');
  });

  it('looks up the linked nullifier immediately', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ found: true, voteHash: HASH, txHash: HASH, blockNumber: 7, timestamp: 1_760_000_000 })
    );
    renderWithI18n(<ReceiptLookup initialNullifier="777" />);

    expect(await screen.findByText('Vote hash')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
