'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { ElectionCard } from './election-card';
import { ElectionCardSkeleton } from './election-skeleton';

/**
 * Elections list for the home page. Renders skeletons-free states so a voter on
 * a slow connection always gets an explanation rather than a blank screen.
 */
export function ElectionsList() {
  const t = useTranslations();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.elections,
    queryFn: ({ signal }) => api.getElections(signal)
  });

  return (
    <section aria-labelledby="elections-heading" id="elections" className="mt-12 scroll-mt-28">
      <p className="eyebrow">{t('home.electionsTitle')}</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="elections-heading" className="text-xl font-bold text-navy-900 sm:text-2xl">
          {t('home.electionsTitle')}
        </h2>
        {isFetching && !isPending ? (
          <p className="text-sm text-ink-muted" role="status">
            {t('common.loading')}
          </p>
        ) : null}
      </div>

      {isPending ? (
        <div aria-busy="true">
          <p className="sr-only" role="status">
            {t('home.electionsLoading')}
          </p>
          <ul aria-hidden="true" className="mt-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <li key={index} className="h-full">
                <ElectionCardSkeleton />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isError ? (
        <div role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-4">
          <p className="text-base text-red-900">{t('home.electionsError')}</p>
          <button type="button" onClick={() => void refetch()} className="btn-secondary mt-3">
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {data && data.length === 0 ? <p className="prose-civic mt-4">{t('home.electionsEmpty')}</p> : null}

      {data && data.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((election) => (
            <li key={election.id} className="h-full">
              <ElectionCard election={election} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}