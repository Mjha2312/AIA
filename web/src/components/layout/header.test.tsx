import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';
import { renderWithI18n } from '@/test/render';

vi.mock('@/i18n/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
    usePathname: () => '/'
  };
});

describe('Header civic navbar', () => {
  it('renders exactly one navbar with the government brand', () => {
    renderWithI18n(<Header />);

    const banners = screen.getAllByRole('banner');
    expect(banners).toHaveLength(1);

    expect(screen.getByText('भारत चुनाव पोर्टल')).toBeInTheDocument();
    expect(screen.getByText('AADHAAR E-VOTING PORTAL')).toBeInTheDocument();
  });

  it('shows trust indicators and keeps existing functional routes', () => {
    renderWithI18n(<Header />);
    const header = screen.getByRole('banner');

    expect(within(header).getByText('Secure')).toBeInTheDocument();
    expect(within(header).getByText('Transparent')).toBeInTheDocument();
    expect(within(header).getByText('Verifiable')).toBeInTheDocument();

    expect(within(header).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/en');
    expect(within(header).getByRole('link', { name: 'My receipt' })).toHaveAttribute('href', '/en/receipt');
    expect(within(header).getByRole('link', { name: 'Explorer' })).toHaveAttribute('href', '/en/explorer');
    expect(within(header).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/en/admin');
    // No Sign In / Login CTA may exist in the navbar.
    expect(within(header).queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('opens info modals from the utility buttons', async () => {
    renderWithI18n(<Header />);
    const header = screen.getByRole('banner');

    await userEvent.click(within(header).getByRole('button', { name: 'FAQs' }));
    expect(await screen.findByRole('dialog', { name: 'Frequently Asked Questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Is my vote truly secret?' })).toBeInTheDocument();
  });

  it('expands FAQ answers and closes the modal via the X button', async () => {
    renderWithI18n(<Header />);

    await userEvent.click(screen.getByRole('button', { name: 'FAQs' }));
    const dialog = await screen.findByRole('dialog', { name: 'Frequently Asked Questions' });

    // Unopened answers stay hidden until their question is expanded…
    expect(screen.queryByText(/independently verify your vote/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How do I know my vote was counted?' }));
    expect(await within(dialog).findByText(/independently verify your vote/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the About and Help content without inventing routes', async () => {
    renderWithI18n(<Header />);

    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(await screen.findByRole('dialog', { name: 'About the Portal' })).toBeInTheDocument();
    expect(screen.getByText(/next-generation democratic tool/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByRole('dialog', { name: 'Need Assistance?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1800-111-XXXX' })).toHaveAttribute('href', 'tel:1800111XXXX');
    expect(screen.getByRole('link', { name: 'techsupport@evoting.gov.in' })).toHaveAttribute(
      'href',
      'mailto:techsupport@evoting.gov.in'
    );
  });
});
