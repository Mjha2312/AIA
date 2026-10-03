'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { AuditRuns } from './audit-runs';
import { TallyCheck } from './tally-check';
import { VotesTable } from './votes-table';

/**
 * ECI block explorer: pick an election, page through its public votes, search
 * them, recount the tally in the browser, and review shadow-audit runs.
 */
export function ExplorerDashboard() {
  const t = useTranslations();
  const electionsQuery = useQuery({
    queryKey: queryKeys.elections,
    queryFn: ({ signal }) => api.getElections(signal)
  });
  const [electionId, setElectionId] = useState<string | null>(null);

  const selectedId = electionId ?? electionsQuery.data?.[0]?.id ?? null;
  const electionQuery = useQuery({
    queryKey: selectedId ? queryKeys.election(selectedId) : ['election', 'none'],
    queryFn: ({ signal }) => api.getElection(selectedId as string, signal),
    enabled: selectedId != null
  });

  return (
    <div>
      <div className="page-hero">
        <h1>{t('explorer.title')}</h1>
        <p className="prose-civic mt-2 max-w-prose">{t('explorer.stub')}</p>
      </div>

      {electionsQuery.isPending && <p className="prose-civic mt-4">{t('common.loading')}</p>}
      {electionsQuery.isError && (
        <div className="mt-4">
          <p className="prose-civic" role="alert">{t('explorer.loadError')}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => electionsQuery.refetch()}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {electionsQuery.data && (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-navy-900" htmlFor="explorer-election">
            {t('explorer.selectElection')}
          </label>
          <select
            id="explorer-election"
            className="mt-1 min-h-touch w-full max-w-md rounded-md border border-navy-300 bg-white px-3 py-2 text-base text-ink"
            value={selectedId ?? ''}
            onChange={(event) => setElectionId(event.target.value)}
          >
            {electionsQuery.data.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.constituencyId}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedId && electionQuery.isPending && <p className="prose-civic mt-4">{t('common.loading')}</p>}
      {selectedId && electionQuery.data && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-navy-900">{t('explorer.votesTitle')}</h2>
          <VotesTable electionId={selectedId} candidates={electionQuery.data.candidates} />

          <h2 className="mt-8 text-lg font-bold text-navy-900">{t('explorer.verifyTitle')}</h2>
          <TallyCheck election={electionQuery.data} />

          <h2 className="mt-8 text-lg font-bold text-navy-900">{t('explorer.auditsTitle')}</h2>
          <p className="prose-civic mt-1">{t('explorer.auditsBody')}</p>
          <AuditRuns election={electionQuery.data} />
        </div>
      )}
    </div>
  );
}
