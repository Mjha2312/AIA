'use client';

import { useTranslations } from 'next-intl';

import { Accordion } from '@/components/ui/accordion';
import { Dialog } from '@/components/ui/dialog';

export type InfoModalKind = 'faqs' | 'about' | 'help';

/**
 * Navbar info modals: FAQs (accordion), About, Help. Content comes from the
 * `info` message namespace; contact details render as real tel:/mailto:
 * links. Styling follows the civic system: white surface, p-6, dark text,
 * X close in the top right (see ui/dialog).
 */
export function InfoModal({ kind, onClose }: { kind: InfoModalKind; onClose: () => void }) {
  const t = useTranslations('info');

  if (kind === 'faqs') {
    return (
      <Dialog title={t('faqsTitle')} onClose={onClose} wide>
        <Accordion
          items={[
            { id: 'q1', question: t('faqQ1'), answer: t('faqA1') },
            { id: 'q2', question: t('faqQ2'), answer: t('faqA2') },
            { id: 'q3', question: t('faqQ3'), answer: t('faqA3') }
          ]}
        />
      </Dialog>
    );
  }

  if (kind === 'about') {
    return (
      <Dialog title={t('aboutTitle')} onClose={onClose}>
        <p className="text-[15px] leading-relaxed text-ink">{t('aboutBody')}</p>
      </Dialog>
    );
  }

  return (
    <Dialog title={t('helpTitle')} onClose={onClose}>
      <p className="text-[15px] leading-relaxed text-ink">
        {t('helpBefore')}
        <a href={`tel:${t('helpPhone').replace(/-/g, '')}`} className="font-semibold text-navy-700 underline hover:text-navy-900">
          {t('helpPhone')}
        </a>
        {t('helpMid')}
        <a href={`mailto:${t('helpEmail')}`} className="font-semibold text-navy-700 underline hover:text-navy-900">
          {t('helpEmail')}
        </a>
        {t('helpAfter')}
      </p>
    </Dialog>
  );
}
