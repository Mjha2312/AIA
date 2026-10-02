'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ProposeFormsProps {
  elections: { id: string; constituencyId: string }[];
  busy: boolean;
  notice: string | null;
  onProposeCreate: (constituencyId: string, candidates: string[]) => void;
  onProposeAdvance: (electionId: string) => void;
}

/**
 * Proposal forms. Creating an election needs a constituency plus at least two
 * candidates; advancing a phase asks for confirmation because on-chain phase
 * changes cannot be undone.
 */
export function ProposeForms({ elections, busy, notice, onProposeCreate, onProposeAdvance }: ProposeFormsProps) {
  const t = useTranslations();
  const [constituency, setConstituency] = useState('');
  const [candidates, setCandidates] = useState('');
  const [advanceId, setAdvanceId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  function proposeCreate(): void {
    const names = candidates
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (constituency.trim().length === 0 || names.length < 2) {
      setFormError(t('admin.needsElection'));
      return;
    }
    setFormError(null);
    onProposeCreate(constituency.trim(), names);
  }

  function proposeAdvance(): void {
    if (!/^\d+$/.test(advanceId.trim())) {
      setFormError(t('admin.needsElectionId'));
      return;
    }
    setFormError(null);
    setConfirmAdvance(true);
  }

  const inputClass =
    'mt-1 min-h-touch w-full max-w-md rounded-md border border-navy-300 bg-white px-3 py-2 text-base text-ink';

  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <section className="card" aria-labelledby="propose-create-title">
        <h3 id="propose-create-title" className="text-lg font-bold text-navy-900">
          {t('admin.createTitle')}
        </h3>
        <label className="mt-3 block text-sm font-semibold text-navy-900" htmlFor="propose-constituency">
          {t('admin.constituencyLabel')}
        </label>
        <input
          id="propose-constituency"
          className={inputClass}
          value={constituency}
          onChange={(event) => setConstituency(event.target.value)}
          placeholder={t('admin.constituencyPlaceholder')}
        />
        <label className="mt-3 block text-sm font-semibold text-navy-900" htmlFor="propose-candidates">
          {t('admin.candidatesLabel')}
        </label>
        <textarea
          id="propose-candidates"
          className={`${inputClass} min-h-28`}
          rows={4}
          value={candidates}
          onChange={(event) => setCandidates(event.target.value)}
          placeholder={t('admin.candidatesPlaceholder')}
        />
        <button type="button" className="btn-primary mt-3" disabled={busy} onClick={proposeCreate}>
          {t('admin.proposeCreate')}
        </button>
      </section>

      <section className="card" aria-labelledby="propose-advance-title">
        <h3 id="propose-advance-title" className="text-lg font-bold text-navy-900">
          {t('admin.advanceTitle')}
        </h3>
        <label className="mt-3 block text-sm font-semibold text-navy-900" htmlFor="propose-election-id">
          {t('admin.electionLabel')}
        </label>
        <input
          id="propose-election-id"
          className={inputClass}
          inputMode="numeric"
          list="admin-election-ids"
          value={advanceId}
          onChange={(event) => setAdvanceId(event.target.value)}
        />
        <datalist id="admin-election-ids">
          {elections.map((election) => (
            <option key={election.id} value={election.id}>
              {election.constituencyId}
            </option>
          ))}
        </datalist>
        <div>
          <button type="button" className="btn-primary mt-3" disabled={busy} onClick={proposeAdvance}>
            {t('admin.advanceButton')}
          </button>
        </div>
      </section>

      {formError && (
        <p className="prose-civic md:col-span-2" role="alert">
          {formError}
        </p>
      )}
      {notice && (
        <p className="prose-civic md:col-span-2" role="status">
          {notice}
        </p>
      )}

      {confirmAdvance && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="advance-confirm-title"
          onClick={() => setConfirmAdvance(false)}
        >
          <div className="card w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <h3 id="advance-confirm-title" className="text-lg font-bold text-navy-900">
              {t('admin.confirmTitle')}
            </h3>
            <p className="prose-civic mt-2">
              {t('admin.confirmBody', {
                description: t('admin.txAdvancePhaseBare', { election: advanceId.trim() })
              })}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary"
                autoFocus
                onClick={() => {
                  setConfirmAdvance(false);
                  onProposeAdvance(advanceId.trim());
                }}
              >
                {t('admin.confirmSign')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmAdvance(false)}>
                {t('admin.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
