import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

/**
 * Civic header: wordmark, the routes a voter actually needs, and the explorer
 * entry point. Sticky, because on a phone it saves a long scroll back up.
 */
export function Header() {
  const t = useTranslations();

  const links = [
    { href: '/', label: t('nav.home') },
    { href: '/receipt', label: t('nav.receipt') },
    { href: '/explorer', label: t('nav.explorer') },
    { href: '/admin', label: t('nav.admin') }
  ] as const;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="bg-gradient-to-r from-saffron-500 via-white to-green-500" aria-hidden="true">
        <div className="mx-auto h-1 w-full max-w-6xl" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="tap text-lg font-bold tracking-tight text-navy-900 hover:text-navy-700 sm:text-xl">
          AIA Vote
        </Link>

        <nav aria-label={t('nav.primaryLabel')} className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="tap rounded-md px-3 py-2 text-base text-navy-900 hover:bg-navy-50"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <LanguageSwitcher />
      </div>
    </header>
  );
}