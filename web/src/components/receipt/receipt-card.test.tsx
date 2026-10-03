import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ReceiptCard } from './receipt-card';
import { renderWithI18n } from '@/test/render';

const HASH = `0x${'cd'.repeat(32)}`;
const receipt = { found: true, voteHash: HASH, txHash: HASH, blockNumber: 42, timestamp: 1_760_000_000 };

describe('ReceiptCard', () => {
  beforeEach(() => {
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn(() => 'blob:mock');
    url.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders public hashes in monospace with copy actions and no private material', () => {
    const { container } = renderWithI18n(<ReceiptCard nullifier="null-123" receipt={receipt} />);

    expect(screen.getByText('Vote hash')).toBeInTheDocument();
    expect(screen.getAllByText(HASH)).toHaveLength(2);
    expect(container.querySelectorAll('.hash-value').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('button', { name: /Copy/ }).length).toBeGreaterThanOrEqual(3);

    // Private material must never appear on the receipt: no trapdoor,
    // identity export, or Aadhaar values — only public hashes + nullifier.
    expect(screen.queryByText(/trapdoor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/identityExport/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aadhaar/i)).not.toBeInTheDocument();
  });

  it('shows a labelled QR verification code and an accessible verification link', () => {
    renderWithI18n(<ReceiptCard nullifier="null-123" receipt={receipt} />);

    expect(screen.getByText('Verification QR')).toBeInTheDocument();
    expect(screen.getByText('Verification link')).toBeInTheDocument();
    expect(screen.getByText(/receipt\?nullifier=null-123/)).toBeInTheDocument();
  });

  it('offers a client-side download that stays on-device', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderWithI18n(<ReceiptCard nullifier="null-123" receipt={receipt} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download receipt' }));

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
