import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageStub } from '@/components/layout/page-stub';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'explorer' });
  return { title: t('title'), description: t('stub') };
}

export default async function ExplorerPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'explorer' });

  return <PageStub title={t('title')} description={t('stub')} />;
}