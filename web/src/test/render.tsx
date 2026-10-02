import type { ReactElement, ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';

import bn from '../../messages/bn.json';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import mr from '../../messages/mr.json';
import ta from '../../messages/ta.json';
import te from '../../messages/te.json';
import type { Locale } from '@/i18n/locales';

export const messages = { en, hi, ta, bn, te, mr } as const;

/** Providers matching `src/app/[locale]/layout.tsx`. */
export function renderWithI18n(
  ui: ReactElement,
  options: { locale?: Locale } & Omit<RenderOptions, 'wrapper'> = {}
) {
  const { locale = 'en', ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/** Builds a `Response`-alike good enough for the typed client in `src/lib/api.ts`. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}