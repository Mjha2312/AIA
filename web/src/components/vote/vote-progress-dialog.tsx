'use client';

import { useTranslations } from 'next-intl';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type VoteTxStatus = 'proving' | 'relaying' | 'done' | 'error';

/**
 * Trust-building transaction progress: turns ZK + ledger waiting time into
 * explicit, honest steps. Only reflects real client state — never claims
 * confirmation before the relay response arrives.
 */
export function VoteProgressDialog({
  status,
  error,
  onClose,
  onRetry
}: {
  status: VoteTxStatus;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('vote');

  const steps = [
    {
      key: 'selected',
      title: t('txSelected'),
      desc: t('txSelectedDesc'),
      state: 'done' as const
    },
    {
      key: 'proof',
      title: t('txProof'),
      desc: t('txProofDesc'),
      state: status === 'proving' ? ('active' as const) : 'done' as const
    },
    {
      key: 'ledger',
      title: t('txLedger'),
      desc: t('txLedgerDesc'),
      state:
        status === 'proving'
          ? ('pending' as const)
          : status === 'relaying' || status === 'error'
            ? ('active' as const)
            : status === 'done'
              ? ('done' as const)
              : ('pending' as const)
    },
    {
      key: 'confirmed',
      title: t('txConfirmed'),
      desc: t('txConfirmedDesc'),
      state: status === 'done' ? ('done' as const) : ('pending' as const)
    }
  ];

  // The dialog is only dismissible once the vote is confirmed or has
  // failed — never mid-proof, so no vote state can be lost by accident.
  const closable = status === 'done' || status === 'error';

  function blockDismiss(event: { preventDefault: () => void }): void {
    if (!closable) event.preventDefault();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closable && onClose()}>
      <DialogContent showClose={closable} onClose={onClose} onEscapeKeyDown={blockDismiss} onPointerDownOutside={blockDismiss}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-navy-900">{t('txTitle')}</DialogTitle>
        </DialogHeader>
        <ol aria-live="polite" aria-label={t('txTitle')} className="space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
              {step.state === 'done' ? (
                <span className="animate-civic-check flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                  ✓
                </span>
              ) : step.state === 'active' ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-navy-700">
                  <span className="animate-civic-pulse-soft h-2.5 w-2.5 rounded-full bg-navy-700" />
                </span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 text-xs text-slate-400">
                  ○
                </span>
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-[15px] font-bold ${step.state === 'pending' ? 'text-ink-muted' : 'text-navy-900'}`}>
                {step.title}
                {step.state === 'active' ? <span className="sr-only"> — in progress</span> : null}
              </p>
              <p className="text-sm leading-relaxed text-ink-muted">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {status === 'error' && error ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3" role="alert">
          <p className="text-sm font-bold text-red-900">{t('txErrorTitle')}</p>
          <p className="mt-1 text-sm text-red-900">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="btn-primary px-4 py-1.5 text-sm">
              {t('txRetry')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">
              {t('txCancelVote')}
            </button>
          </div>
        </div>
      ) : null}

      {status === 'done' ? (
        <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">
          {t('viewReceipt')}
        </button>
      ) : null}
      </DialogContent>
    </Dialog>
  );
}
