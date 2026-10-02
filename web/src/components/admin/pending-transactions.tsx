'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Hex } from 'viem';

import {
  decodeMultisigAction,
  describeMultisigAction,
  type ActionDescription,
  type ElectionContext
} from '@/lib/multisig';
import { ELECTION_MANAGER_ADDRESS } from '@/lib/chain';

export interface PendingTx {
  id: number;
  target: string;
  data: Hex;
  approvals: bigint;
  executed: boolean;
  approvedByMe: boolean;
}

interface PendingListProps {
  txs: PendingTx[];
  threshold: number;
  isOwner: boolean;
  elections: Map<string, ElectionContext>;
  busyId: number | null;
  onApprove: (id: number) => void;
  onExecute: (id: number) => void;
}

interface ConfirmState {
  id: number;
  action: 'approve' | 'execute';
  description: string;
}

/**
 * Pending multi-sig transactions with decoded, human-readable descriptions.
 * Approving or executing an `advancePhase` call always asks for confirmation
 * first — phase changes cannot be undone on chain.
 */
export function PendingTransactions({
  txs,
  threshold,
  isOwner,
  elections,
  busyId,
  onApprove,
  onExecute
}: PendingListProps) {
  const t = useTranslations();
  const tp = useTranslations('phases');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  function describe(tx: PendingTx): string {
    const description: ActionDescription = describeMultisigAction(
      decodeMultisigAction({ target: tx.target, data: tx.data }, ELECTION_MANAGER_ADDRESS),
      elections
    );
    switch (description.key) {
      case 'txCreateElection':
        return t('admin.txCreateElection', {
          constituency: String(description.values.constituency),
          count: Number(description.values.count)
        });
      case 'txAdvancePhase':
        return t('admin.txAdvancePhase', {
          constituency: String(description.values.constituency),
          from: tp(String(description.values.from) as 'voting'),
          to: tp(String(description.values.to) as 'voting')
        });
      case 'txAdvancePhaseBare':
        return t('admin.txAdvancePhaseBare', { election: String(description.values.election) });
      case 'txUnknown':
        return t('admin.txUnknown', { target: String(description.values.target) });
    }
  }

  function isPhaseChange(tx: PendingTx): boolean {
    return (
      decodeMultisigAction({ target: tx.target, data: tx.data }, ELECTION_MANAGER_ADDRESS).kind ===
      'advancePhase'
    );
  }

  function request(action: 'approve' | 'execute', tx: PendingTx): void {
    if (isPhaseChange(tx)) {
      setConfirm({ id: tx.id, action, description: describe(tx) });
      return;
    }
    if (action === 'approve') onApprove(tx.id);
    else onExecute(tx.id);
  }

  function confirmAction(): void {
    if (!confirm) return;
    if (confirm.action === 'approve') onApprove(confirm.id);
    else onExecute(confirm.id);
    setConfirm(null);
  }

  const pending = txs.filter((tx) => !tx.executed);

  if (pending.length === 0) {
    return <p className="prose-civic mt-3">{t('admin.pendingEmpty')}</p>;
  }

  return (
    <div className="mt-3">
      <ul className="space-y-3">
        {pending.map((tx) => {
          const approvals = Number(tx.approvals);
          const canExecute = approvals >= threshold;
          return (
            <li key={tx.id} className="card">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-navy-900">#{tx.id}</strong>
                <span className="rounded-full bg-navy-100 px-2 py-0.5 text-sm font-semibold text-navy-800">
                  {t('admin.approvalsOf', { count: approvals, threshold })}
                </span>
                {tx.approvedByMe && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-sm font-semibold text-green-800">
                    {t('admin.approvedByYou')}
                  </span>
                )}
              </div>
              <p className="prose-civic mt-1">{describe(tx)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!isOwner || tx.approvedByMe || busyId === tx.id}
                  onClick={() => request('approve', tx)}
                >
                  {t('admin.approve')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!canExecute || busyId === tx.id}
                  onClick={() => request('execute', tx)}
                >
                  {t('admin.execute')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="phase-confirm-title"
          onClick={() => setConfirm(null)}
        >
          <div
            className="card w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirm(null);
            }}
          >
            <h3 id="phase-confirm-title" className="text-lg font-bold text-navy-900">
              {t('admin.confirmTitle')}
            </h3>
            <p className="prose-civic mt-2">
              {t('admin.confirmBody', { description: confirm.description })}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary" autoFocus onClick={confirmAction}>
                {t('admin.confirmSign')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
                {t('admin.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
