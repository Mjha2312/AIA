'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { Phase, isPhaseAtLeast } from '@/lib/phases';
import { compareTallies, recomputeTally } from '@/lib/tally';
import { fetchAllVotes } from '@/lib/votes';
import type { Election } from '@/lib/schemas';

type Status =
  | { state: 'idle' }
  | { state: 'loading'; loaded: number }
  | { state: 'error' }
  | {
      state: 'done';
      votes: number;
      truncated: boolean;
      recomputed: number[];
      official: number[] | null;
      match: boolean | null;
      diff: number[];
    };

/**
 * The key trust demo: recount every vote in the browser and compare against
 * the official tally. The official tally only exists from Tallying on (SPEC);
 * before that the recount is still shown, marked as unofficial.
 */
export function TallyCheck({ election }: { election: Election }) {
  const t = useTranslations();
  const format = useFormatter();
  const [status, setStatus] = useState<Status>({ state: 'idle' });

  const official = isPhaseAtLeast(election.phase, Phase.Tallying) ? election.tally ?? null : null;

  async function verify(): Promise<void> {
    setStatus({ state: 'loading', loaded: 0 });
    try {
      const { votes, truncated } = await fetchAllVotes(election.id, {
        onProgress: (loaded) => setStatus({ state: 'loading', loaded })
      });
      const recomputed = recomputeTally(votes, election.candidates.length);
      if (official) {
        const comparison = compareTallies(official, recomputed);
        setStatus({
          state: 'done',
          votes: votes.length,
          truncated,
          recomputed,
          official,
          match: comparison.match,
          diff: comparison.diff
        });
      } else {
        setStatus({ state: 'done', votes: votes.length, truncated, recomputed, official: null, match: null, diff: [] });
      }
    } catch {
      setStatus({ state: 'error' });
    }
  }

  return (
    <div className="card mt-3">
      <p className="prose-civic">{t('explorer.verifyBody')}</p>
      {status.state === 'idle' && (
        <button type="button" className="btn-primary mt-3" onClick={() => void verify()}>
          {t('explorer.verifyStart')}
        </button>
      )}
      {status.state === 'loading' && (
        <p className="prose-civic mt-3" role="status">
          {t('explorer.verifyProgress', { count: format.number(status.loaded) })}
        </p>
      )}
      {status.state === 'error' && (
        <div className="mt-3">
          <p className="prose-civic" role="alert">{t('explorer.verifyError')}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => void verify()}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {status.state === 'done' && (
        <div className="mt-3">
          <p
            role="status"
            className={`rounded-md px-3 py-2 text-base font-bold ${
              status.match === false
                ? 'bg-red-50 text-red-800'
                : 'bg-green-50 text-green-800'
            }`}
          >
            {status.match == null
              ? t('explorer.verifyHidden')
              : status.match
                ? t('explorer.verifyMatch')
                : t('explorer.verifyMismatch')}
          </p>
          <p className="prose-civic mt-2 text-sm">
            {t('explorer.showingCount', { count: status.votes })}
            {status.truncated ? ` ${t('explorer.verifyCapped', { count: format.number(status.votes) })}` : ''}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-left">
                    {t('turnout.candidateColumn')}
                  </th>
                  {status.official && (
                    <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                      {t('explorer.officialTally')}
                    </th>
                  )}
                  <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                    {t('explorer.recountedTally')}
                  </th>
                  {status.official && (
                    <th scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-right">
                      {t('explorer.diffRow')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {election.candidates.map((name, index) => {
                  const diff = status.diff[index] ?? 0;
                  return (
                    <tr key={name}>
                      <td className="border border-navy-200 px-2 py-1">{name}</td>
                      {status.official && (
                        <td className="border border-navy-200 px-2 py-1 text-right">
                          {format.number(status.official[index] ?? 0)}
                        </td>
                      )}
                      <td className="border border-navy-200 px-2 py-1 text-right">
                        {format.number(status.recomputed[index] ?? 0)}
                      </td>
                      {status.official && (
                        <td
                          className={`border border-navy-200 px-2 py-1 text-right font-bold ${
                            diff !== 0 ? 'text-red-700' : ''
                          }`}
                        >
                          {diff === 0 ? '0' : format.number(diff)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-secondary mt-3" onClick={() => void verify()}>
            {t('explorer.verifyStart')}
          </button>
        </div>
      )}
    </div>
  );
}
