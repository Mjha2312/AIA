import { useTranslations } from 'next-intl';

export function Hero() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="hero-heading" className="border-b border-slate-200 pb-8">
      <p className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-3 py-1 text-sm font-semibold text-green-800">
        {t('explainerTitle')}
      </p>
      <h1 id="hero-heading" className="mt-4 max-w-3xl text-3xl font-bold leading-tight text-navy-900 sm:text-4xl">
        {t('title')}
      </h1>
      <p className="prose-civic mt-4 max-w-prose">{t('subtitle')}</p>
      <a href="#elections" className="btn-primary mt-6">
        {t('exploreElections')}
      </a>
    </section>
  );
}

const STEP_KEYS = ['proofTitle', 'nullifierTitle', 'chainTitle', 'auditTitle'] as const;
const STEP_BODY_KEYS = ['proofBody', 'nullifierBody', 'chainBody', 'auditBody'] as const;

export function HowItWorks() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby="how-it-works-heading" className="mt-10">
      <h2 id="how-it-works-heading" className="text-xl font-bold text-navy-900 sm:text-2xl">
        {t('explainerTitle')}
      </h2>
      <p className="prose-civic mt-1">{t('explainerIntro')}</p>

      <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {STEP_KEYS.map((key, index) => (
          <li key={key} className="card">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <h3 className="mt-1 text-base font-bold text-navy-900">{t(`steps.${key}`)}</h3>
            <p className="prose-civic mt-1">{t(`steps.${STEP_BODY_KEYS[index]}`)}</p>
          </li>
        ))}
      </ol>

      <p className="prose-civic mt-4 border-l-4 border-green-500 pl-4">{t('explainerFootnote')}</p>
    </section>
  );
}