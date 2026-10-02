import { defineRouting } from 'next-intl/routing';

import { defaultLocale, locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Keep the language in the URL: every translation is separately cacheable and
  // a shared link never silently switches the reader's language.
  localePrefix: 'always'
});