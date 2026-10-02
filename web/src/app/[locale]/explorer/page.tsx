import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ExplorerDashboard } from '@/components/explorer/explorer-dashboard';

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

  return (
    <section>
      <ExplorerDashboard />
    </section>
  );
}
