'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import QRCode from 'react-qr-code';

import type { Receipt } from '@/lib/schemas';
import { HashValue } from '@/components/ui/hash-value';

/**
 * Premium verification receipt. Public values only: vote hash, transaction,
 * nullifier (receipt key), block, time, verification URL + QR. Never renders
 * private keys or Semaphore secrets.
 */
export function ReceiptCard({ nullifier, receipt }: { nullifier: string; receipt: Receipt }) {
  const t = useTranslations('receipt');
  const tCommon = useTranslations();
  const format = useFormatter();
  const [downloaded, setDownloaded] = useState(false);

  const verificationUrl = useMemo(() => {
    const path = `/receipt?nullifier=${encodeURIComponent(nullifier)}`;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, [nullifier]);

  function download(): void {
    const payload = {
      kind: 'aia-vote-receipt',
      nullifier,
      voteHash: receipt.voteHash,
      txHash: receipt.txHash,
      blockNumber: receipt.blockNumber,
      timestamp: receipt.timestamp,
      verificationUrl,
      exportedAt: new Date().toISOString(),
      note: 'Public receipt only. Contains no private keys or identity secrets.'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aia-vote-receipt-${nullifier.slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1600);
  }

  return (
    <section aria-labelledby="receipt-card-heading" className="mt-4 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-navy-900 to-navy-700 px-5 py-4">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-green-200">
          <span aria-hidden="true">✓</span> {t('verifiedBadge')}
        </p>
        <h2 id="receipt-card-heading" className="mt-2 text-lg font-bold text-white">
          {tCommon('receipt.title')}
        </h2>
        <p className="mt-1 text-sm text-slate-200">{t('premiumSubtitle')}</p>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_220px]">
        <div className="min-w-0">
          <dl className="space-y-4">
            {receipt.voteHash ? <HashValue label={t('voteHashLabel')} value={receipt.voteHash} /> : null}
            {receipt.txHash ? <HashValue label={t('txHashLabel')} value={receipt.txHash} /> : null}
            <HashValue label={t('nullifierLabel')} value={nullifier} />
            {receipt.blockNumber !== null ? (
              <div>
                <dt className="text-sm font-semibold text-navy-900">{t('blockLabel')}</dt>
                <dd className="mt-1 text-sm tabular-nums text-ink">{format.number(receipt.blockNumber)}</dd>
              </div>
            ) : null}
            {receipt.timestamp !== null ? (
              <div>
                <dt className="text-sm font-semibold text-navy-900">{t('timeLabel')}</dt>
                <dd className="mt-1 text-sm text-ink">
                  {format.dateTime(new Date(receipt.timestamp * 1000), {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm font-semibold text-navy-900">{t('verifyUrlLabel')}</dt>
              <dd className="hash-value mt-1 rounded-md bg-slate-50 px-2.5 py-1.5">{verificationUrl}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={download} aria-live="polite" className="btn-secondary px-4 py-2 text-sm">
              {downloaded ? tCommon('common.copied') : t('download')}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t('downloadHint')}</p>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-navy-900">{t('qrLabel')}</p>
          <div className="rounded-md bg-white p-2.5 shadow-sm" role="img" aria-label={`${t('qrLabel')}: ${verificationUrl}`}>
            <QRCode value={verificationUrl} size={160} level="M" />
          </div>
          <p className="text-center text-xs leading-relaxed text-ink-muted">{t('qrHint')}</p>
        </div>
      </div>
    </section>
  );
}
