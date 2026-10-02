import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageStub } from '@/components/layout/page-stub';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'vote' });
  return { title: t('title'), description: t('stub') };
}

export default async function VotePage({ params }: { params: { locale: string; electionId: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'vote' });

  return <PageStub title={`${t('title')} · ${params.electionId}`} description={t('stub')} />;
}