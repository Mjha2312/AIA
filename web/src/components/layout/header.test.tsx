import { screen, within } from '@testing-library/react';
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

  it('routes utility links to real in-page anchors instead of invented routes', () => {
    renderWithI18n(<Header />);
    const header = screen.getByRole('banner');

    expect(within(header).getByRole('link', { name: 'FAQs' })).toHaveAttribute('href', '#how-it-works');
    expect(within(header).getByRole('link', { name: 'About' })).toHaveAttribute('href', '#about');
    expect(within(header).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '#receipt-help');
  });
});
