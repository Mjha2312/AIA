import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageStub } from '@/components/layout/page-stub';

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('title'), description: t('stub') };
}

export default async function AdminPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = await getTranslations({ locale: params.locale, namespace: 'admin' });

  return (
    <section>
      <PageStub title={t('title')} description={t('stub')} />
      <p className="mt-4 rounded-md border border-navy-200 bg-navy-50 px-4 py-3 text-base font-medium text-navy-800">
        {t('walletNotice')}
      </p>
    </section>
  );
}