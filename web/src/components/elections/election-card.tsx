import { useFormatter, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { isVotingOpen } from '@/lib/phases';
import type { Election } from '@/lib/schemas';
import { PhaseBadge } from './phase-badge';

export function ElectionCard({ election }: { election: Election }) {
  const t = useTranslations();
  const format = useFormatter();
  const headingId = `election-${election.id}`;
  const votingOpen = isVotingOpen(election.phase);
  const turnoutPct = election.turnoutPct ?? null;

  return (
    <article className="card flex h-full flex-col gap-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t('electionCard.constituency')}
          </p>
          <h3 id={headingId} className="text-lg font-bold text-navy-900">
            {election.constituencyId}
          </h3>
        </div>
        <PhaseBadge phase={election.phase} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-ink-muted">{t('common.registered')}</dt>
          <dd className="text-base font-semibold text-ink">
            {format.number(election.registeredCount, { maximumFractionDigits: 0 })}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t('common.voted')}</dt>
          <dd className="text-base font-semibold text-ink">
            {format.number(election.votedCount, { maximumFractionDigits: 0 })}
          </dd>
        </div>
      </dl>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-navy-900">{t('common.turnout')}</span>
          {turnoutPct === null ? (
            <span className="text-ink-muted">{t('electionCard.turnoutUnavailable')}</span>
          ) : (
            <span className="font-semibold text-green-700">
              {format.number(turnoutPct, { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div
            className="h-full rounded-full bg-green-600"
            style={{ width: `${Math.min(100, Math.max(0, turnoutPct ?? 0))}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-ink-muted">{t('electionCard.candidateCount', { count: election.candidates.length })}</p>

      <div className="mt-auto">
        <Link
          href={votingOpen ? `/vote/${election.id}` : `/turnout/${election.id}`}
          className={votingOpen ? 'btn-primary w-full' : 'btn-secondary w-full'}
        >
          {votingOpen ? t('home.castVote') : t('home.viewDetails')}
        </Link>
      </div>
    </article>
  );
}