import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <p
          role="note"
          className="rounded-md border border-saffron-200 bg-saffron-50 px-4 py-3 text-base font-medium text-saffron-800"
        >
          {t('footer.prototypeNotice')}
        </p>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-base font-bold text-navy-900">AIA Vote</p>
            <p className="prose-civic mt-1 max-w-prose">{t('footer.builtFor')}</p>
          </div>

          <nav aria-labelledby="footer-links" className="shrink-0">
            <h2 id="footer-links" className="text-base font-semibold text-navy-900">
              {t('footer.linksTitle')}
            </h2>
            <ul className="mt-2 space-y-1">
              {[
                { href: '/', label: t('nav.home') },
                { href: '/explorer', label: t('nav.explorer') },
                { href: '/receipt', label: t('nav.receipt') },
                { href: '/admin', label: t('nav.admin') }
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-touch items-center text-base text-navy-700 underline hover:text-navy-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="text-sm text-ink-muted">{t('footer.copyright', { year })}</p>
      </div>
    </footer>
  );
}