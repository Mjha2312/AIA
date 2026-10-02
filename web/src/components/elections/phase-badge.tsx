import { useTranslations } from 'next-intl';

import { phaseMessageKey, type Phase } from '@/lib/phases';

/**
 * Phase badge. Colours are chosen so the label clears WCAG AA on its own
 * background; saffron and green appear as accents only.
 */
const STYLES: Record<Phase, string> = {
  0: 'border-slate-300 bg-slate-100 text-slate-800',
  1: 'border-saffron-300 bg-saffron-100 text-saffron-800',
  2: 'border-green-300 bg-green-100 text-green-800',
  3: 'border-navy-300 bg-navy-100 text-navy-800',
  4: 'border-navy-900 bg-navy-900 text-white'
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  const t = useTranslations('phases');

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${STYLES[phase]}`}
      data-testid="phase-badge"
    >
      {t(phaseMessageKey(phase))}
    </span>
  );
}