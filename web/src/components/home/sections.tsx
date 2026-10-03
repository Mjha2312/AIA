import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { UnderHood } from '@/components/ui/under-hood';

export function Hero() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="hero-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-navy-900 via-navy-700 to-navy-900 px-5 py-8 sm:px-8 sm:py-10">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-green-300" />
          {t('heroBadge')}
        </p>
        <h1 id="hero-heading" className="mt-4 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-200">{t('subtitle')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#elections"
            className="tap rounded-md border border-white bg-white px-5 py-2.5 text-base font-bold text-navy-900 transition-colors hover:bg-navy-50"
          >
            {t('exploreElections')}
          </a>
          <a
            href="#how-it-works"
            className="tap rounded-md border border-white/40 px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t('explainerTitle')}
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-300">{t('trustLine')}</p>
      </div>
    </section>
  );
}

type StepKey = 'proof' | 'nullifier' | 'chain' | 'audit';

const STEPS: { key: StepKey; titleKey: string; bodyKey: string; underKey: string }[] = [
  { key: 'proof', titleKey: 'proofTitle', bodyKey: 'proofBody', underKey: 'proofUnder' },
  { key: 'nullifier', titleKey: 'nullifierTitle', bodyKey: 'nullifierBody', underKey: 'nullifierUnder' },
  { key: 'chain', titleKey: 'chainTitle', bodyKey: 'chainBody', underKey: 'chainUnder' },
  { key: 'audit', titleKey: 'auditTitle', bodyKey: 'auditBody', underKey: 'auditUnder' }
];

function StepIcon({ step }: { step: StepKey }) {
  const common = 'feature-card-icon h-10 w-10';
  if (step === 'proof') {
    return (
      <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
        <path d="M20 3 33 8v10c0 8.5-5.4 14.6-13 17C12.4 32.6 7 26.5 7 18V8L20 3Z" fill="#E1E5F4" stroke="#1D2E77" strokeWidth="2" />
        <rect x="13" y="15" width="14" height="10" rx="2" fill="#fff" stroke="#1D2E77" strokeWidth="1.6" />
        <circle cx="20" cy="19" r="2" fill="#1D2E77" className="animate-civic-pulse-soft" />
        <path d="M17.5 22.5l1.8 1.8 3.4-3.6" fill="none" stroke="#127006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-civic-check" />
      </svg>
    );
  }
  if (step === 'nullifier') {
    return (
      <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
        <circle cx="20" cy="16" r="7" fill="#E1E5F4" stroke="#1D2E77" strokeWidth="2" />
        <path d="M10 34c1.5-5 5.5-7.5 10-7.5S28.5 29 30 34" fill="none" stroke="#1D2E77" strokeWidth="2" strokeLinecap="round" />
        <g className="animate-civic-check">
          <circle cx="29" cy="29" r="7" fill="#fff" stroke="#127006" strokeWidth="2" />
          <path d="M26.5 29l1.8 1.8 3-3.4" fill="none" stroke="#127006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }
  if (step === 'chain') {
    return (
      <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
        <rect x="9" y="10" width="22" height="15" rx="2.5" fill="#FFF8ED" stroke="#9A4E07" strokeWidth="2" />
        <path d="M14 17h12M14 20.5h7" stroke="#9A4E07" strokeWidth="1.6" strokeLinecap="round" />
        <g className="animate-civic-check">
          <circle cx="29" cy="28" r="7" fill="#fff" stroke="#127006" strokeWidth="2" />
          <path d="M26.5 28l1.8 1.8 3-3.4" fill="none" stroke="#127006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
      <rect x="4" y="24" width="9" height="9" rx="1.5" fill="#E1E5F4" stroke="#1D2E77" strokeWidth="1.6" />
      <rect x="15.5" y="24" width="9" height="9" rx="1.5" fill="#E1E5F4" stroke="#1D2E77" strokeWidth="1.6" />
      <rect x="27" y="24" width="9" height="9" rx="1.5" fill="#E1E5F4" stroke="#1D2E77" strokeWidth="1.6" />
      <circle cx="8.5" cy="12" r="3.5" fill="#fff" stroke="#1D2E77" strokeWidth="1.6" />
      <circle cx="20" cy="12" r="3.5" fill="#fff" stroke="#1D2E77" strokeWidth="1.6" />
      <circle cx="31.5" cy="12" r="3.5" fill="#fff" stroke="#1D2E77" strokeWidth="1.6" />
      <path d="M8.5 15.5v8.5M20 15.5v8.5M31.5 15.5v8.5M12 12h4.5M23.5 12H28" stroke="#1D2E77" strokeWidth="1.4" className="animate-civic-draw" />
    </svg>
  );
}

export function HowItWorks() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="how-it-works-heading" id="how-it-works" className="mt-10 scroll-mt-24">
      <h2 id="how-it-works-heading" className="text-xl font-bold text-navy-900 sm:text-2xl">
        {t('explainerTitle')}
      </h2>
      <p className="prose-civic mt-1">{t('explainerIntro')}</p>

      <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li
            key={step.key}
            className="group/feature card transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <StepIcon step={step.key} />
              <span
                aria-hidden="true"
                className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white"
              >
                {index + 1}
              </span>
            </div>
            <h3 className="mt-2 text-base font-bold text-navy-900">{t(`steps.${step.titleKey}`)}</h3>
            <p className="prose-civic mt-1 text-[15px]">{t(`steps.${step.bodyKey}`)}</p>
            <UnderHood id={step.key} detail={t(`steps.${step.underKey}`)} />
          </li>
        ))}
      </ol>

      <p className="prose-civic mt-5 border-l-4 border-green-500 pl-4">{t('explainerFootnote')}</p>
    </section>
  );
}

export function ReceiptCallout() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="receipt-callout-heading" className="mt-10 overflow-hidden rounded-xl border border-green-200 bg-green-50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="receipt-callout-heading" className="text-lg font-bold text-green-800">
            {t('receiptTitle')}
          </h2>
          <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-green-900/80">{t('receiptBody')}</p>
        </div>
        <Link
          href="/receipt"
          className="tap inline-flex shrink-0 items-center justify-center rounded-md border border-green-700 bg-green-600 px-5 py-2.5 text-base font-bold text-white transition-colors hover:bg-green-700"
        >
          {t('receiptCta')}
        </Link>
      </div>
    </section>
  );
}
