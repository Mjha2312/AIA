import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HowItWorks, ReceiptCallout } from './sections';
import { renderWithI18n } from '@/test/render';

describe('HowItWorks visual storytelling', () => {
  it('keeps the four-step meaning and order intact', () => {
    renderWithI18n(<HowItWorks />);

    const steps = screen.getByRole('list').querySelectorAll(':scope > li');
    expect(steps).toHaveLength(4);
    const headings = within(screen.getByRole('list')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Your identity stays private',
      'Nobody can vote twice',
      'Your vote is on the record',
      'The count is checked'
    ]);
  });

  it('hides technical jargon behind progressive disclosure', async () => {
    renderWithI18n(<HowItWorks />);

    // Plain-English benefit is visible; Semaphore detail is hidden until expanded.
    expect(screen.queryByText(/Semaphore creates an anonymous identity/)).not.toBeInTheDocument();

    const toggles = screen.getAllByRole('button', { name: /Under the hood/ });
    expect(toggles).toHaveLength(4);

    await userEvent.click(toggles[0]!);
    expect(await screen.findByText(/Semaphore creates an anonymous identity/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide technical details/ })).toBeInTheDocument();
  });
});

describe('ReceiptCallout', () => {
  it('links to the receipt surface after the explainer', () => {
    renderWithI18n(<ReceiptCallout />);

    expect(screen.getByRole('heading', { name: 'Keep your proof' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How receipts work' })).toHaveAttribute('href', '/en/receipt');
  });
});
