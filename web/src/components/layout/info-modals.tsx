'use client';

import { useTranslations } from 'next-intl';

import { Accordion } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type InfoModalKind = 'faqs' | 'about' | 'help';

const TITLE_CLASS = 'text-xl font-bold text-slate-900';

/**
 * Navbar info modals: FAQs (accordion), About, Help. Content comes from the
 * `info` message namespace; contact details render as real tel:/mailto:
 * links. Every modal uses the DialogHeader/DialogTitle structure on a clean
 * white surface with the standard X close in the top right.
 */
export function InfoModal({ kind, onClose }: { kind: InfoModalKind; onClose: () => void }) {
  const t = useTranslations('info');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {kind === 'faqs' ? (
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle className={TITLE_CLASS}>{t('faqsTitle')}</DialogTitle>
          </DialogHeader>
          <Accordion
            items={[
              { id: 'q1', question: t('faqQ1'), answer: t('faqA1') },
              { id: 'q2', question: t('faqQ2'), answer: t('faqA2') },
              { id: 'q3', question: t('faqQ3'), answer: t('faqA3') }
            ]}
          />
        </DialogContent>
      ) : null}

      {kind === 'about' ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={TITLE_CLASS}>{t('aboutTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-[15px] leading-relaxed text-ink">{t('aboutBody')}</p>
        </DialogContent>
      ) : null}

      {kind === 'help' ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={TITLE_CLASS}>{t('helpTitle')}</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
