'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { Phase, isVotingOpen, phaseMessageKey } from '@/lib/phases';
import { queryKeys } from '@/lib/query-keys';

/**
 * Read-only ballot for one election, plus a phase guard.
 *
 * - Voting phase: shows the candidate list (the interactive KYC → register →
 *   prove → relay steps arrive in follow-up PRs).
 * - Registration phase: explains that voting opens later.
 * - Any other phase: points at the turnout page.
 */
export function VoteFlow({ electionId }: { electionId: string }) {
  const t = useTranslations();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: ({ signal }) => api.getElection(electionId, signal)
  });

  if (isPending) {
    return (
      <p className="prose-civic mt-4" role="status">
        {t('vote.loading')}
      </p>
    );
  }

  if (isError) {
    const message =
      error instanceof ApiError && error.status === 404 ? t('common.notFound') : t('vote.loadError');
    return (
      <div className="mt-4">
        <p className="prose-civic" role="alert">
          {message}
        </p>
        <button type="button" className="btn-secondary mt-3" onClick={() => void refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const election = data;
  const phaseKey = phaseMessageKey(election.phase);

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">
        {t('vote.title')} · {election.constituencyId}
      </h1>

      {isVotingOpen(election.phase) ? (
        <section aria-labelledby="ballot-heading" className="card mt-6">
          <h2 id="ballot-heading" className="text-lg font-bold text-navy-900">
            {t('vote.ballotTitle')}
          </h2>
          <p className="prose-civic mt-2 text-sm">{t('vote.ballotHint')}</p>
          <ol className="mt-4 space-y-2">
            {election.candidates.map((candidate, index) => (
              <li
                key={`${index}-${candidate}`}
                className="rounded-md border border-navy-200 px-3 py-2 text-base text-ink"
              >
                {candidate}
              </li>
            ))}
          </ol>
          <h3 className="mt-6 text-base font-bold text-navy-900">{t('vote.comingTitle')}</h3>
          <p className="prose-civic mt-1 text-sm">{t('vote.comingBody')}</p>
        </section>
      ) : null}

      {election.phase === Phase.Registration ? (
        <section aria-labelledby="registration-heading" className="card mt-6">
          <h2 id="registration-heading" className="text-lg font-bold text-navy-900">
            {t('vote.registrationTitle')}
          </h2>
          <p className="prose-civic mt-2 text-sm">{t('vote.registrationBody')}</p>
        </section>
      ) : null}

      {!isVotingOpen(election.phase) && election.phase !== Phase.Registration ? (
        <section aria-labelledby="closed-heading" className="card mt-6">
          <h2 id="closed-heading" className="text-lg font-bold text-navy-900">
            {t('vote.closedTitle')}
          </h2>
          <p className="prose-civic mt-2 text-sm">
            {t('vote.closedBody', { phase: t(`phases.${phaseKey}`) })}
          </p>
          <Link href={`/turnout/${election.id}`} className="btn-secondary mt-4 inline-block">
            {t('vote.viewTurnout')}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
