'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Link } from '@/i18n/navigation';
import { HashValue } from '@/components/ui/hash-value';
import { api, ApiError } from '@/lib/api';
import { Phase, isVotingOpen, phaseMessageKey } from '@/lib/phases';
import { queryKeys } from '@/lib/query-keys';
import { loadStoredCommitment } from '@/lib/vote-identity';
import { BallotStep, type CastResult } from './ballot-step';
import { IdentityStep, KycStep, RegisterStep, type RegisterResult } from './vote-steps';

/**
 * Voting page flow for one election, guarded by phase.
 *
 * - Registration phase: KYC → anonymous identity → anonymous registration.
 * - Voting phase: candidate ballot preview plus a resume/closed notice
 *   (candidate selection and the secret ballot arrive in the next PR).
 * - Any other phase: points at the turnout page.
 */
export function VoteFlow({ electionId }: { electionId: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.election(electionId),
    queryFn: ({ signal }) => api.getElection(electionId, signal)
  });

  // Wizard state lives here so each step can stay small. The kycToken is
  // short-lived and in-memory only; the identity export stays on-device.
  const [kycToken, setKycToken] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);
  const [castResult, setCastResult] = useState<CastResult | null>(null);

  // Device identity (if this browser registered before). Read after mount so
  // server rendering and the first client paint agree.
  const [mounted, setMounted] = useState(false);
  const [storedCommitment, setStoredCommitment] = useState<string | null>(null);
  useEffect(() => {
    setMounted(true);
    setStoredCommitment(loadStoredCommitment(electionId));
  }, [electionId]);

  function handleRegisterDone(result: RegisterResult): void {
    setRegisterResult(result);
    setStoredCommitment(loadStoredCommitment(electionId));
    void queryClient.invalidateQueries({ queryKey: queryKeys.election(electionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.turnout(electionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.group(electionId) });
  }

  function handleVoted(result: CastResult): void {
    setCastResult(result);
    void queryClient.invalidateQueries({ queryKey: queryKeys.election(electionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.turnout(electionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.votes(electionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.group(electionId) });
  }

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
      <div className="page-hero">
        <h1>
          {t('vote.title')} · {election.constituencyId}
        </h1>
      </div>

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
        </section>
      ) : null}

      {mounted && isVotingOpen(election.phase) && storedCommitment && !castResult ? (
        <section aria-labelledby="ballot-pick-section" className="card mt-6">
          <BallotStep
            electionId={election.id}
            candidates={election.candidates}
            onVoted={handleVoted}
          />
        </section>
      ) : null}

      {castResult ? (
        <section aria-labelledby="voted-heading" className="mt-6 overflow-hidden rounded-xl border border-green-300 bg-white shadow-sm">
          <div className="bg-green-600 px-5 py-3">
            <h2 id="voted-heading" className="text-lg font-bold text-white">
              ✓ {t('vote.voteDone')}
            </h2>
            <p className="mt-0.5 text-sm text-green-50">{t('vote.voteDoneBody')}</p>
          </div>
          <div className="space-y-4 p-5 text-sm">
            <dl className="space-y-4">
              <HashValue label={t('vote.voteHashLabel')} value={castResult.voteHash} />
              <HashValue label={t('vote.txHashLabel')} value={castResult.txHash} />
              <HashValue label={t('vote.nullifierLabel')} value={castResult.nullifier} />
            </dl>
            <p className="prose-civic mt-2 text-sm">{t('vote.nullifierHint')}</p>
            <Link
              href={`/receipt?nullifier=${encodeURIComponent(castResult.nullifier)}`}
              className="btn-secondary mt-4 inline-block"
            >
              {t('vote.viewReceipt')}
            </Link>
          </div>
        </section>
      ) : null}

      {mounted && isVotingOpen(election.phase) && !storedCommitment ? (
        <section aria-labelledby="reg-closed-heading" className="card mt-6">
          <h2 id="reg-closed-heading" className="text-lg font-bold text-navy-900">
            {t('vote.regClosedTitle')}
          </h2>
          <p className="prose-civic mt-2 text-sm">{t('vote.regClosedBody')}</p>
        </section>
      ) : null}

      {election.phase === Phase.Registration ? (
        <section aria-labelledby="registration-heading" className="card mt-6">
          <h2 id="registration-heading" className="text-lg font-bold text-navy-900">
            {t('vote.registrationTitle')}
          </h2>
          <p className="prose-civic mt-2 text-sm">{t('vote.registrationBody')}</p>

          <div className="mt-6 space-y-8">
            <KycStep electionId={election.id} onVerified={setKycToken} />
            {kycToken ? <IdentityStep electionId={election.id} onCreated={setCommitment} /> : null}
            {kycToken && commitment && !registerResult ? (
              <RegisterStep
                electionId={election.id}
                kycToken={kycToken}
                commitment={commitment}
                onDone={handleRegisterDone}
              />
            ) : null}
            {registerResult ? (
              <div aria-labelledby="registered-heading">
                <h3 id="registered-heading" className="text-base font-bold text-navy-900">
                  {t('vote.registerTxLabel')}
                </h3>
                {registerResult.txHash ? (
                  <code className="mt-1 block break-all rounded-md bg-slate-100 px-3 py-2 text-sm">
                    {registerResult.txHash}
                  </code>
                ) : null}
                <p className="prose-civic mt-2 text-sm">
                  {registerResult.alreadyRegistered ? t('vote.alreadyRegistered') : t('vote.registerDone')}
                </p>
              </div>
            ) : null}
          </div>
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
