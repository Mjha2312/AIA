import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { UnderHood } from '@/components/ui/under-hood';

const EMBLEM_SRC = 'https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg';

/**
 * Official National Emblem of India artwork, served from its canonical
 * source and tinted gold via CSS so it stands out on the navy hero.
 */
function NationalEmblem({ alt }: { alt: string }) {
  return (
    <Image
      src={EMBLEM_SRC}
      alt={alt}
      width={220}
      height={280}
      unoptimized
      priority={false}
      className="emblem-gold h-44 w-auto object-contain sm:h-56 lg:h-64"
    />
  );
}

export function Hero() {
  const t = useTranslations('home');

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden rounded-2xl bg-navy-800 shadow-[0_2px_16px_rgba(12,19,56,0.25)]"
    >
      <div className="relative grid items-center gap-8 px-5 py-9 sm:px-8 sm:py-12 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold-500/60 bg-white/5 px-3 py-1 text-sm font-semibold text-gold-100">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-gold-500" />
            {t('heroBadge')}
          </p>
          <h1 id="hero-heading" className="mt-4 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-200">{t('subtitle')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#elections"
              className="tap rounded-md bg-gold-500 px-5 py-2.5 text-base font-bold text-navy-900 transition-colors hover:bg-gold-100"
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
          <p className="mt-5 flex items-start gap-2 text-sm text-slate-300">
            <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
              ✓
            </span>
            {t('trustLine')}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 justify-self-center lg:justify-self-end lg:pr-6">
          <NationalEmblem alt={t('emblemAlt')} />
          <p className="text-lg font-bold tracking-wide text-gold-100">{t('motto')}</p>
        </div>
      </div>
      <div aria-hidden="true" className="h-1 bg-gradient-to-r from-saffron-500 via-gold-500 to-green-500" />
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
        <path d="M20 3 33 8v10c0 8.5-5.4 14.6-13 17C12.4 32.6 7 26.5 7 18V8L20 3Z" fill="#EAF1FB" stroke="#141F52" strokeWidth="2" />
        <rect x="13" y="15" width="14" height="10" rx="2" fill="#fff" stroke="#141F52" strokeWidth="1.6" />
        <circle cx="20" cy="19" r="2" fill="#141F52" className="animate-civic-pulse-soft" />
        <path d="M17.5 22.5l1.8 1.8 3.4-3.6" fill="none" stroke="#127006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="animate-civic-check" />
      </svg>
    );
  }
  if (step === 'nullifier') {
    return (
      <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
        <circle cx="20" cy="16" r="7" fill="#EAF1FB" stroke="#141F52" strokeWidth="2" />
        <path d="M10 34c1.5-5 5.5-7.5 10-7.5S28.5 29 30 34" fill="none" stroke="#141F52" strokeWidth="2" strokeLinecap="round" />
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
        <rect x="9" y="10" width="22" height="15" rx="2.5" fill="#FBF6E7" stroke="#7A5D0D" strokeWidth="2" />
        <path d="M14 17h12M14 20.5h7" stroke="#7A5D0D" strokeWidth="1.6" strokeLinecap="round" />
        <g className="animate-civic-check">
          <circle cx="29" cy="28" r="7" fill="#fff" stroke="#127006" strokeWidth="2" />
          <path d="M26.5 28l1.8 1.8 3-3.4" fill="none" stroke="#127006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className={common} role="img" aria-hidden="true">
      <rect x="4" y="24" width="9" height="9" rx="1.5" fill="#EAF1FB" stroke="#141F52" strokeWidth="1.6" />
      <rect x="15.5" y="24" width="9" height="9" rx="1.5" fill="#EAF1FB" stroke="#141F52" strokeWidth="1.6" />
      <rect x="27" y="24" width="9" height="9" rx="1.5" fill="#EAF1FB" stroke="#141F52" strokeWidth="1.6" />
      <circle cx="8.5" cy="12" r="3.5" fill="#fff" stroke="#141F52" strokeWidth="1.6" />
      <circle cx="20" cy="12" r="3.5" fill="#fff" stroke="#141F52" strokeWidth="1.6" />
      <circle cx="31.5" cy="12" r="3.5" fill="#fff" stroke="#141F52" strokeWidth="1.6" />
      <path d="M8.5 15.5v8.5M20 15.5v8.5M31.5 15.5v8.5M12 12h4.5M23.5 12H28" stroke="#141F52" strokeWidth="1.4" className="animate-civic-draw" />
    </svg>
  );
}

export function HowItWorks() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="how-it-works-heading" id="how-it-works" className="mt-12 scroll-mt-28">
      <p className="eyebrow">{t('explainerTitle')}</p>
      <h2 id="how-it-works-heading" className="mt-2 text-xl font-bold text-navy-900 sm:text-2xl">
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
                className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-500 bg-gold-50 text-xs font-bold text-gold-700"
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

      <p className="prose-civic mt-5 border-l-4 border-gold-500 pl-4">{t('explainerFootnote')}</p>
    </section>
  );
}

export function ReceiptCallout() {
  const t = useTranslations('home');

  return (
    <section
      aria-labelledby="receipt-callout-heading"
      id="receipt-help"
      className="card mt-10 scroll-mt-28 overflow-hidden !p-0"
    >
      <div className="h-1 bg-gradient-to-r from-navy-900 via-gold-500 to-green-600" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900">
            <svg viewBox="0 0 20 20" className="h-5 w-5 text-gold-100">
              <path d="M10 1.5l6 2.4v5c0 4-2.6 6.9-6 8.1-3.4-1.2-6-4.1-6-8.1v-5l6-2.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M7.4 9.6l1.8 1.8 3.4-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="receipt-callout-heading" className="text-lg font-bold text-navy-900">
              {t('receiptTitle')}
            </h2>
            <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-ink-muted">{t('receiptBody')}</p>
          </div>
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
