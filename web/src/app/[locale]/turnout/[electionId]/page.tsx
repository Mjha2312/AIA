import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageStub } from '@/components/layout/page-stub';
import { LiveTurnout } from '@/components/turnout/live-turnout';

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
  const t = await getTranslations({ locale: params.locale, namespace: 'turnout' });

  return (
    <section>
      <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{t('title')}</h1>
      <p className="prose-civic mt-2 max-w-prose">
        {t('stub')} <span className="font-semibold text-navy-900">{params.electionId}</span>
      </p>

      <h2 className="mt-6 text-lg font-bold text-navy-900">{t('live')}</h2>
      <LiveTurnout electionId={params.electionId} />
      <p className="prose-civic mt-2 text-sm">{t('pollingNote')}</p>
    </section>
  );
}