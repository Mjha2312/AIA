import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { VoteFlow } from '@/components/vote/vote-flow';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'vote' });
  return { title: t('title'), description: t('subtitle') };
}

export default async function VotePage({ params }: { params: { locale: string; electionId: string } }) {
  setRequestLocale(params.locale);

  return <VoteFlow electionId={params.electionId} />;
}