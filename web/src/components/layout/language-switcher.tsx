'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { localeNames, locales } from '@/i18n/locales';

/**
 * Language switcher. A native `<select>` keeps the touch target and the
 * platform picker intact on low-end phones, and works without JavaScript
 * hydration being fast.
 */
export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-switcher" className="sr-only">
        {t('changeLanguage')}
      </label>
      <select
        id="language-switcher"
        name="language"
        value={locale}
        disabled={isPending}
        aria-label={t('changeLanguage')}
        onChange={(event) => {
          const nextLocale = event.target.value;
          startTransition(() => {
            router.replace(pathname, { locale: nextLocale });
          });
        }}
        className="tap rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-navy-900 hover:border-navy-700"
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
    </div>
  );
}