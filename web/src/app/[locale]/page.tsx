import { setRequestLocale } from 'next-intl/server';

import { ElectionsList } from '@/components/elections/elections-list';
import { Hero, HowItWorks } from '@/components/home/sections';

export default function HomePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <ElectionsList />
      <HowItWorks />
    </>
  );
}