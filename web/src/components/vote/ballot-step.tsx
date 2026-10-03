'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { generateVoteProof, groupHasCommitment } from '@/lib/vote-proof';
import { importVotingIdentity, loadIdentityExport } from '@/lib/vote-identity';
import { VoteProgressDialog } from './vote-progress-dialog';

export interface CastResult {
  voteHash: string;
  txHash: string;
  nullifier: string;
  candidateIndex: number;
}

type TxStatus = 'idle' | 'proving' | 'relaying' | 'done' | 'error';

/**
 * Step 4 — secret ballot. The voter picks a candidate; the browser proves
 * group membership and binds the choice without revealing who voted, then
 * the backend relays the proof on-chain. The nullifier returned is the
 * receipt key and is shown once, loudly.
 *
 * Waiting time is surfaced through an honest step-by-step dialog
 * (selected → ZK proof → ledger → confirmed) bound to real client state.
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
  const [status, setStatus] = useState<TxStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
  const busy = status === 'proving' || status === 'relaying';

  async function runCast(candidateIndex: number): Promise<void> {
    setError(null);
    const live = exported ? importVotingIdentity(exported) : null;
    if (!live) {
      setError(t('vote.noIdentity'));
      setStatus('error');
      return;
    }
    try {
      setStatus('proving');
      const { proof, nullifier } = await generateVoteProof(
        live.identity,
        members,
        candidateIndex,
        electionId
      );
      setStatus('relaying');
      const relayed = await api.relayVote({ electionId, candidateIndex, proof });
      // The nullifier comes from our own proof (the real backend does not
      // echo it); the vote hash is authoritative from the relay response.
      // Confirmation is only shown after this response arrives.
      setStatus('done');
      onVoted({ voteHash: relayed.voteHash, txHash: relayed.txHash, nullifier, candidateIndex });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('vote.stepError'));
      setStatus('error');
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (selected === null || busy) return;
    setDialogOpen(true);
    await runCast(selected);
  }

  function closeDialog(): void {
    setDialogOpen(false);
    // After a confirmed vote the parent swaps to the receipt view; after an
    // error the voter returns to the ballot to retry.
    if (status === 'error') {
      setStatus('idle');
    }
  }

  async function retry(): Promise<void> {
    if (selected === null) {
      setDialogOpen(false);
      setStatus('idle');
      return;
    }
    await runCast(selected);
  }

  return (
    <>
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

        <fieldset className="mt-3 space-y-2" disabled={busy || inGroup !== true}>
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

        {status === 'error' && !dialogOpen && error ? (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={selected === null || busy || inGroup !== true}
          className="btn-primary mt-4"
        >
          {status === 'proving' ? t('vote.proving') : status === 'relaying' ? t('vote.relaying') : t('vote.castButton')}
        </button>
      </form>

      {dialogOpen && status !== 'idle' ? (
        <VoteProgressDialog
          status={status === 'done' ? 'done' : status === 'error' ? 'error' : status === 'relaying' ? 'relaying' : 'proving'}
          error={status === 'error' ? error : null}
          onClose={closeDialog}
          onRetry={() => void retry()}
        />
      ) : null}
    </>
  );
}
