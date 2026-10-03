import { useFormatter, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { Phase, isVotingOpen } from '@/lib/phases';
import type { Election } from '@/lib/schemas';
import { PhaseBadge } from './phase-badge';

const DONUT_COLORS = ['#1D2E77', '#C2620A', '#127006', '#7C3F09', '#6578BB', '#0F5A05', '#9A4E07'];

function winnerFromTally(tally: number[] | null | undefined): number | null {
  if (!tally || tally.length === 0) return null;
  let best = 0;
  let bestVotes = tally[0] ?? -1;
  let tied = false;
  for (let i = 1; i < tally.length; i += 1) {
    const votes = tally[i] ?? 0;
    if (votes > bestVotes) {
      best = i;
      bestVotes = votes;
      tied = false;
    } else if (votes === bestVotes) {
      tied = true;
    }
  }
  if (bestVotes < 0 || tied) return null;
  return best;
}

function DonutChart({ tally, candidates }: { tally: number[]; candidates: string[] }) {
  const t = useTranslations('electionCard');
  const total = tally.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = tally.map((votes, index) => {
    const fraction = votes / total;
    const seg = (
      <circle
        key={`${index}-${candidates[index] ?? index}`}
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
        strokeWidth="12"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        strokeDashoffset={-offset * circumference}
        strokeLinecap="butt"
      />
    );
    offset += fraction;
    return seg;
  });

  return (
    <figure className="mt-1 flex items-center gap-3">
      <svg viewBox="0 0 72 72" className="h-16 w-16 shrink-0" role="img" aria-label={t('distributionSummary')}>
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="12" />
        {segments}
      </svg>
      <figcaption className="min-w-0 text-xs text-ink-muted">
        <span className="font-semibold text-navy-900">{t('distributionLabel')}</span>
        <div className="mt-1 space-y-0.5">
          {tally.map((votes, index) => (
            <p key={`${index}-${candidates[index] ?? index}`} className="truncate">
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              {candidates[index] ?? `#${index + 1}`}: {votes}
            </p>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}

export function ElectionCard({ election }: { election: Election }) {
  const t = useTranslations();
  const format = useFormatter();
  const headingId = `election-${election.id}`;
  const votingOpen = isVotingOpen(election.phase);
  const isRegistration = election.phase === Phase.Registration;
  const isFinalized = election.phase === Phase.Finalized;
  const turnoutPct = election.turnoutPct ?? null;
  const clampedPct = Math.min(100, Math.max(0, turnoutPct ?? 0));
  const winnerIndex = isFinalized ? winnerFromTally(election.tally ?? null) : null;
  const winnerName = winnerIndex !== null ? election.candidates[winnerIndex] : null;
  const showDonut =
    isFinalized && election.tally != null && election.tally.length === election.candidates.length;

  const cardTone = isFinalized
    ? 'border-cream-border bg-[#F7F5F0]'
    : isRegistration
      ? 'border-gold-100 bg-[#FFFEFB]'
      : 'border-green-300 bg-white shadow-[0_2px_16px_rgba(19,136,8,0.08)]';

  return (
    <article
      className={`card flex h-full flex-col gap-4 ${cardTone}`}
      aria-labelledby={headingId}
      data-testid={`election-card-${election.id}`}
      data-phase={election.phase}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t('electionCard.constituency')}
          </p>
          <h3 id={headingId} className="text-lg font-bold leading-snug text-navy-900">
            {election.constituencyId}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PhaseBadge phase={election.phase} />
          {votingOpen ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-green-800">
              <span className="live-dot" aria-hidden="true" />
              {t('electionCard.live')}
            </span>
          ) : null}
        </div>
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
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-navy-900">{t('common.turnout')}</span>
          {turnoutPct === null ? (
            <span className="text-ink-muted">{t('electionCard.turnoutUnavailable')}</span>
          ) : (
            <span className="rounded bg-navy-50 px-2 py-0.5 font-bold tabular-nums text-navy-900">
              {format.number(turnoutPct, { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        <div
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label={`${t('common.turnout')}: ${turnoutPct === null ? t('electionCard.turnoutUnavailable') : `${format.number(turnoutPct, { maximumFractionDigits: 1 })}%`}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={turnoutPct === null ? undefined : Math.round(clampedPct * 10) / 10}
        >
          <div
            aria-hidden="true"
            className={`h-full rounded-full transition-[width] ${isFinalized ? 'bg-navy-700' : 'bg-green-600'}`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-ink-muted">{t('electionCard.candidateCount', { count: election.candidates.length })}</p>

      {isFinalized ? (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          {winnerName ? (
            <p className="text-sm">
              <span className="font-semibold uppercase tracking-wide text-ink-muted">{t('electionCard.winnerLabel')}</span>
              <span className="mt-0.5 block text-base font-bold text-navy-900">{winnerName}</span>
            </p>
          ) : (
            <p className="text-sm text-ink-muted">{t('turnout.tallyHidden')}</p>
          )}
          {showDonut && election.tally ? <DonutChart tally={election.tally} candidates={election.candidates} /> : null}
        </div>
      ) : null}

      <div className="mt-auto pt-1">
        <Link
          href={votingOpen ? `/vote/${election.id}` : `/turnout/${election.id}`}
          className={votingOpen ? 'btn-primary w-full text-center' : 'btn-secondary w-full text-center'}
        >
          {votingOpen ? t('home.castVote') : t('home.viewDetails')}
        </Link>
      </div>
    </article>
  );
}
