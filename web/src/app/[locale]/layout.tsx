import { type ReactNode } from 'react';
import type { Metadata } from 'next';
import { Noto_Sans, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Tamil, Noto_Sans_Telugu } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import '@/app/globals.css';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { isLocale } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { Providers } from '../providers';

/**
 * One Noto Sans face per script in use, exposed as CSS variables so the Tailwind
 * font stack in `tailwind.config.ts` can serve Latin, Devanagari (hi, mr),
 * Tamil, Bengali and Telugu from the same family.
 */
const notoSans = Noto_Sans({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const notoSansDevanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-deva', display: 'swap' });
const notoSansTamil = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-tamil', display: 'swap' });
const notoSansBengali = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-bengali', display: 'swap' });
const notoSansTelugu = Noto_Sans_Telugu({ subsets: ['telugu'], variable: '--font-telugu', display: 'swap' });

const fontVariables = [notoSans, notoSansDevanagari, notoSansTamil, notoSansBengali, notoSansTelugu];

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((code) => [code, `/${code}`]))
    }
  };
}

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale });

  return (
    <html lang={locale} className={fontVariables.map((font) => font.variable).join(' ')}>
      <body className="flex min-h-screen flex-col bg-cream">
        <Providers>
          <NextIntlClientProvider messages={messages}>
            <a className="skip-link" href="#main">
              {t('skipToContent')}
            </a>
            <Header />
            <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:py-10">
              {children}
            </main>
            <Footer />
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  );
}