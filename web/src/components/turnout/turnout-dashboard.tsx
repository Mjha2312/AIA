'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { api, ApiError } from '@/lib/api';
import { subscribeToChainEvents } from '@/lib/live';
import { Phase, isPhaseAtLeast } from '@/lib/phases';
import { queryKeys } from '@/lib/query-keys';
import { bucketVotesByTime } from '@/lib/tally';
import { fetchAllVotes } from '@/lib/votes';
import { LiveTurnout } from './live-turnout';

const CHART_BUCKETS = 24;
const LIVE_REFETCH_MS = 5_000;

/**
 * Turnout analytics: live registered/voted counters plus a votes-over-time
 * curve and (from Tallying on) a per-candidate breakdown. Live updates arrive
 * over the `/ws` feed; a 5s turnout poll covers transports that drop.
 */
export function TurnoutDashboard({ electionId }: { electionId: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const queryClient = useQueryClient();

  const electionQuery = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: ({ signal }) => api.getElection(electionId, signal)
  });
  const historyQuery = useQuery({
    queryKey: [...queryKeys.votes(electionId), 'history'],
    queryFn: ({ signal }) => fetchAllVotes(electionId, { signal }),
    staleTime: 60_000
  });

  useEffect(
    () =>
      subscribeToChainEvents({
        electionId,
        onEvent: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.turnout(electionId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.election(electionId) });
        }
      }),
    [electionId, queryClient]
  );

  const buckets = useMemo(
    () => bucketVotesByTime(historyQuery.data?.votes ?? [], CHART_BUCKETS),
    [historyQuery.data]
  );

  if (electionQuery.isPending) return <p className="prose-civic mt-4">{t('common.loading')}</p>;
  if (electionQuery.isError) {
    const message =
      electionQuery.error instanceof ApiError && electionQuery.error.status === 404
        ? t('common.notFound')
        : t('turnout.loadError');
    return (
      <div className="mt-4">
        <p className="prose-civic" role="alert">{message}</p>
        <button type="button" className="btn-secondary mt-3" onClick={() => electionQuery.refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const election = electionQuery.data;
  const tallyVisible = isPhaseAtLeast(election.phase, Phase.Tallying) && election.tally != null;
  const totalVotes = historyQuery.data?.votes.length ?? 0;
  const truncated = historyQuery.data?.truncated ?? false;

  const curve = buckets.map((bucket) => ({ time: Math.round(bucket.start * 1000), votes: bucket.cumulative }));
  const bars = election.candidates.map((name, index) => ({
    name,
    votes: election.tally?.[index] ?? 0
  }));

  return (
    <div>
      <div className="page-hero">
        <h1>
          {t('turnout.live')} · {election.constituencyId}
        </h1>
      </div>

      <LiveTurnout electionId={electionId} pollIntervalMs={LIVE_REFETCH_MS} />
      <p className="prose-civic mt-2 text-sm">{t('turnout.pollingNote')}</p>

      <h2 className="mt-8 text-lg font-bold text-navy-900">{t('turnout.chartTitle')}</h2>
      {historyQuery.isPending && <p className="prose-civic mt-2">{t('turnout.chartLoading')}</p>}
      {historyQuery.isError && (
        <p className="prose-civic mt-2" role="alert">{t('turnout.chartError')}</p>
      )}
      {historyQuery.data && buckets.length === 0 && (
        <p className="prose-civic mt-2">{t('turnout.chartEmpty')}</p>
      )}
      {curve.length > 0 && (
        <figure className="card mt-3">
          <div
            role="img"
            aria-label={t('turnout.chartSummary', { count: totalVotes })}
            className="h-64 w-full sm:h-72"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C4CBE9" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(value: number) =>
                    format.dateTime(new Date(value), { hour: '2-digit', minute: '2-digit' })
                  }
                  tick={{ fontSize: 12 }}
                  type="number"
                  domain={['dataMin', 'dataMax']}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={48} />
                <Tooltip
                  labelFormatter={(value: ReactNode) =>
                    format.dateTime(new Date(Number(value)), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }
                />
                <Line type="monotone" dataKey="votes" stroke="#1D2E77" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {truncated && (
            <p className="prose-civic mt-2 text-sm">{t('turnout.chartCapped', { count: totalVotes })}</p>
          )}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-navy-800">{t('turnout.dataTable')}</summary>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-navy-200 px-2 py-1 text-left">{t('turnout.timeColumn')}</th>
                  <th className="border border-navy-200 px-2 py-1 text-right">{t('turnout.cumulativeColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {curve.map((point) => (
                  <tr key={point.time}>
                    <td className="border border-navy-200 px-2 py-1">
                      {format.dateTime(new Date(point.time), {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="border border-navy-200 px-2 py-1 text-right">
                      {format.number(point.votes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      )}

      <h2 className="mt-8 text-lg font-bold text-navy-900">{t('turnout.byCandidateTitle')}</h2>
      {!tallyVisible && <p className="prose-civic mt-2">{t('turnout.tallyHidden')}</p>}
      {tallyVisible && (
        <figure className="card mt-3">
          <div role="img" aria-label={t('turnout.barsSummary')} className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C4CBE9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-18} dy={10} height={56} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={48} />
                <Tooltip />
                <Bar dataKey="votes" fill="#127006" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-navy-800">{t('turnout.dataTable')}</summary>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-navy-200 px-2 py-1 text-left">{t('turnout.candidateColumn')}</th>
                  <th className="border border-navy-200 px-2 py-1 text-right">{t('turnout.votesColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar) => (
                  <tr key={bar.name}>
                    <td className="border border-navy-200 px-2 py-1">{bar.name}</td>
                    <td className="border border-navy-200 px-2 py-1 text-right">{format.number(bar.votes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      )}
    </div>
  );
}
