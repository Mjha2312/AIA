import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { TurnoutDashboard } from '@/components/turnout/turnout-dashboard';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'turnout' });
  return { title: t('title'), description: t('stub') };
}

export default async function TurnoutPage({ params }: { params: { locale: string; electionId: string } }) {
  setRequestLocale(params.locale);

  return (
    <section>
      <TurnoutDashboard electionId={params.electionId} />
    </section>
  );
}
