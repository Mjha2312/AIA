'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { generateVoteProof, groupHasCommitment } from '@/lib/vote-proof';
import { importVotingIdentity, loadIdentityExport } from '@/lib/vote-identity';

export interface CastResult {
  voteHash: string;
  txHash: string;
  nullifier: string;
  candidateIndex: number;
}

/**
 * Step 4 — secret ballot. The voter picks a candidate; the browser proves
 * group membership and binds the choice without revealing who voted, then
 * the backend relays the proof on-chain. The nullifier returned is the
 * receipt key and is shown once, loudly.
 */
export function BallotStep({
  electionId,
  candidates,
  onVoted
}: {
  electionId: string;
  candidates: string[];
  onVoted: (result: CastResult) => void;
}) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'proving' | 'relaying'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const groupQuery = useQuery({
    queryKey: queryKeys.group(electionId),
    queryFn: ({ signal }) => api.getGroup(electionId, signal)
  });

  if (!mounted) {
    return (
      <p className="prose-civic mt-4" role="status">
        {t('common.loading')}
      </p>
    );
  }

  const exported = loadIdentityExport(electionId);
  const restored = exported ? importVotingIdentity(exported) : null;
  if (!restored) {
    return (
      <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
        {t('vote.noIdentity')}
      </p>
    );
  }

  const members = groupQuery.data?.members ?? [];
  const inGroup = groupQuery.data ? groupHasCommitment(members, restored.commitment) : null;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (selected === null || status !== 'idle') return;
    setError(null);
    // Re-resolve the identity inside the handler: render-scope narrowing
    // does not survive into this closure.
    const live = exported ? importVotingIdentity(exported) : null;
    if (!live) {
      setError(t('vote.noIdentity'));
      return;
    }
    try {
      setStatus('proving');
      const { proof, nullifier } = await generateVoteProof(
        live.identity,
        members,
        selected,
        electionId
      );
      setStatus('relaying');
      const relayed = await api.relayVote({ electionId, candidateIndex: selected, proof });
      // The nullifier comes from our own proof (the real backend does not
      // echo it); the vote hash is authoritative from the relay response.
      onVoted({ voteHash: relayed.voteHash, txHash: relayed.txHash, nullifier, candidateIndex: selected });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('vote.stepError'));
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-labelledby="ballot-pick-heading">
      <h3 id="ballot-pick-heading" className="text-base font-bold text-navy-900">
        {t('vote.ballotPick')}
      </h3>

      {groupQuery.isPending ? (
        <p className="prose-civic mt-2 text-sm" role="status">
          {t('common.loading')}
        </p>
      ) : null}

      {groupQuery.isError ? (
        <div className="mt-2">
          <p className="text-sm text-red-900" role="alert">
            {t('vote.loadError')}
          </p>
          <button type="button" className="btn-secondary mt-2" onClick={() => void groupQuery.refetch()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {inGroup === false ? (
        <div className="mt-2">
          <p className="text-sm text-amber-900" role="alert">
            {t('vote.notInGroup')}
          </p>
          <button type="button" className="btn-secondary mt-2" onClick={() => void groupQuery.refetch()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <fieldset className="mt-3 space-y-2" disabled={status !== 'idle' || inGroup !== true}>
        <legend className="sr-only">{t('vote.ballotPick')}</legend>
        {candidates.map((candidate, index) => (
          <label
            key={`${index}-${candidate}`}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-navy-200 px-3 py-2 text-base text-ink has-checked:border-navy-700 has-checked:bg-navy-50"
          >
            <input
              type="radio"
              name="candidate"
              value={index}
              checked={selected === index}
              onChange={() => setSelected(index)}
              className="h-4 w-4"
            />
            {candidate}
          </label>
        ))}
      </fieldset>

      {error ? (
        <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={selected === null || status !== 'idle' || inGroup !== true}
        className="btn-primary mt-4"
      >
        {status === 'proving' ? t('vote.proving') : status === 'relaying' ? t('vote.relaying') : t('vote.castButton')}
      </button>
    </form>
  );
}
