/**
 * Single registry of supported locales.
 *
 * Adding a language (SPEC lists 22 official languages in total) is exactly:
 *   1. append the locale code below
 *   2. add its native name to `localeNames`
 *   3. add `messages/<code>.json`
 *
 * `npm run i18n:check` fails if any registered locale is missing a key that
 * exists in `messages/en.json`, so step 3 cannot be half done.
 */
export const locales = ['en', 'hi', 'ta', 'bn', 'te', 'mr'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Endonyms — a voter should always be able to find their language. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  bn: 'বাংলা',
  te: 'తెలుగు',
  mr: 'मराठी'
};

/** Locales whose glyphs need a dedicated Noto Sans face in the CSS stack. */
export const scriptFontVar: Record<Locale, string | null> = {
  en: 'var(--font-latin)',
  hi: 'var(--font-deva)',
  ta: 'var(--font-tamil)',
  bn: 'var(--font-bengali)',
  te: 'var(--font-telugu)',
  mr: 'var(--font-deva)'
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}