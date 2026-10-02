import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminDashboard } from '@/components/admin/admin-dashboard';

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

  return (
    <section>
      <AdminDashboard />
    </section>
  );
}
