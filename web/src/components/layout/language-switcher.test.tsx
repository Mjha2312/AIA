import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageSwitcher } from './language-switcher';
import { renderWithI18n } from '@/test/render';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/receipt'
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('is a labelled combobox showing the active locale', () => {
    renderWithI18n(<LanguageSwitcher />);

    const select = screen.getByLabelText('Change language');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('en');
  });

  it('offers every supported language by its native name', () => {
    renderWithI18n(<LanguageSwitcher />);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'English',
      'हिन्दी',
      'தமிழ்',
      'বাংলা',
      'తెలుగు',
      'मराठी'
    ]);
  });

  it('keeps the current path when the language changes', async () => {
    renderWithI18n(<LanguageSwitcher />);

    await userEvent.selectOptions(screen.getByLabelText('Change language'), 'ta');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/receipt', { locale: 'ta' });
  });

  it('translates its own label', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'hi' });

    expect(screen.getByLabelText('भाषा बदलें')).toHaveValue('hi');
  });

  it('translates its own label in bengali', () => {
    renderWithI18n(<LanguageSwitcher />, { locale: 'bn' });

    expect(screen.getByLabelText('ভাষা পরিবর্তন করুন')).toHaveValue('bn');
  });
});