'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { subscribeToChainEvents } from '@/lib/live';
import { queryKeys } from '@/lib/query-keys';

/**
 * Live turnout. Uses the one subscription API in `src/lib/live.ts`, which is a
 * WebSocket against the backend and polling against `/api-mock` — the numbers
 * below therefore move in both modes.
 */
export function LiveTurnout({ electionId }: { electionId: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const { data, refetch } = useQuery({
    queryKey: queryKeys.turnout(electionId),
    queryFn: ({ signal }) => api.getTurnout(electionId, signal)
  });

  useEffect(
    () =>
      subscribeToChainEvents({
        electionId,
        onEvent: () => {
          void refetch();
        }
      }),
    [electionId, refetch]
  );

  return (
    <dl className="mt-4 grid grid-cols-3 gap-3">
      <div className="card">
        <dt className="text-sm text-ink-muted">{t('common.registered')}</dt>
        <dd className="text-xl font-bold text-navy-900">
          {data ? format.number(data.registered, { maximumFractionDigits: 0 }) : '—'}
        </dd>
      </div>
      <div className="card">
        <dt className="text-sm text-ink-muted">{t('common.voted')}</dt>
        <dd className="text-xl font-bold text-navy-900">
          {data ? format.number(data.voted, { maximumFractionDigits: 0 }) : '—'}
        </dd>
      </div>
      <div className="card">
        <dt className="text-sm text-ink-muted">{t('common.turnout')}</dt>
        <dd className="text-xl font-bold text-green-700">
          {data ? `${format.number(data.turnoutPct, { maximumFractionDigits: 1 })}%` : '—'}
        </dd>
      </div>
    </dl>
  );
}