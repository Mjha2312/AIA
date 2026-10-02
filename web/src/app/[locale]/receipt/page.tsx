import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ReceiptLookup } from '@/components/receipt/receipt-lookup';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'receipt' });
  return { title: t('title'), description: t('stub') };
}

export default async function ReceiptPage({
  params,
  searchParams
}: {
  params: { locale: string };
  searchParams: { nullifier?: string };
}) {
  setRequestLocale(params.locale);

  return <ReceiptLookup initialNullifier={searchParams.nullifier} />;
}