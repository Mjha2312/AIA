'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Election } from '@/lib/schemas';

/**
 * Shadow-audit view: past booth-EVM-vs-chain comparisons, newest first. A
 * non-zero diff cell is the signal — booth reporting disagrees with the
 * ledger for that candidate.
 */
export function AuditRuns({ election }: { election: Election }) {
  const t = useTranslations();
  const format = useFormatter();
  const auditsQuery = useQuery({
    queryKey: queryKeys.audits(election.id),
    queryFn: ({ signal }) => api.getAudits(election.id, signal)
  });

  if (auditsQuery.isPending) return <p className="prose-civic mt-3">{t('common.loading')}</p>;
  if (auditsQuery.isError) {
    return (
      <div className="mt-3">
        <p className="prose-civic" role="alert">{t('explorer.loadError')}</p>
        <button type="button" className="btn-secondary mt-3" onClick={() => auditsQuery.refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const runs = auditsQuery.data.audits;
  if (runs.length === 0) return <p className="prose-civic mt-3">{t('explorer.auditsEmpty')}</p>;

  return (
    <ul className="mt-3 space-y-4">
      {runs.map((run) => (
        <li key={run.id} className="card">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-navy-900">{t('explorer.auditRun', { id: run.id })}</strong>
            <span
              className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                run.match ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {run.match ? t('explorer.auditMatch') : t('explorer.auditMismatch')}
            </span>
            {run.createdAt != null && (
              <span className="text-sm text-ink-muted">
                {t('explorer.auditCheckedAt', {
                  time: format.dateTime(new Date(run.createdAt * 1000), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                })}
              </span>
            )}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-left">
                    {t('turnout.candidateColumn')}
                  </th>
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                    {t('explorer.chainTally')}
                  </th>
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                    {t('explorer.evmTally')}
                  </th>
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                    {t('explorer.diffRow')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {election.candidates.map((name, index) => {
                  const diff = (run.chainTally[index] ?? 0) - (run.evmTally[index] ?? 0);
                  return (
                    <tr key={name}>
                      <td className="border border-navy-200 px-2 py-1">{name}</td>
                      <td className="border border-navy-200 px-2 py-1 text-right">
                        {format.number(run.chainTally[index] ?? 0)}
                      </td>
                      <td className="border border-navy-200 px-2 py-1 text-right">
                        {format.number(run.evmTally[index] ?? 0)}
                      </td>
                      <td
                        className={`border border-navy-200 px-2 py-1 text-right font-bold ${
                          diff !== 0 ? 'text-red-700' : ''
                        }`}
                      >
                        {diff === 0 ? '0' : format.number(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </li>
      ))}
    </ul>
  );
}
