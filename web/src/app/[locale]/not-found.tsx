import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations();

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{t('common.notFound')}</h1>
      <Link href="/" className="btn-primary mt-4">
        {t('common.backHome')}
      </Link>
    </div>
  );
}