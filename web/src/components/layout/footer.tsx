import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * Civic government-style footer: navy band, prototype notice, existing
 * functional links. Carries the `#about` anchor for the header About link.
 */
export function Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer id="about" className="mt-14 scroll-mt-28 bg-navy-800 text-slate-200">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
        <p
          role="note"
          className="rounded-md border border-gold-500/50 bg-white/5 px-4 py-3 text-[15px] font-medium leading-relaxed text-gold-100"
        >
          {t('footer.prototypeNotice')}
        </p>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-base font-bold text-white">{t('brand.title')}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
              {t('brand.subtitle')}
            </p>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-slate-300">{t('footer.builtFor')}</p>
          </div>

          <nav aria-labelledby="footer-links" className="shrink-0">
            <h2 id="footer-links" className="text-sm font-bold uppercase tracking-wide text-gold-100">
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
                  <Link href={link.href} className="inline-flex min-h-touch items-center text-[15px] text-slate-200 underline decoration-slate-400 underline-offset-2 hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="border-t border-white/10 pt-4 text-sm text-slate-300">{t('footer.copyright', { year })}</p>
      </div>
    </footer>
  );
}
