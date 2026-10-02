'use client';

import { useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Receipt lookup by nullifier. The nullifier is single-use and unlinkable:
 * it proves *a* vote was counted without revealing who cast it.
 */
export function ReceiptLookup({ initialNullifier = '' }: { initialNullifier?: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const [input, setInput] = useState(initialNullifier);
  const [submitted, setSubmitted] = useState<string | null>(initialNullifier || null);

  const receiptQuery = useQuery({
    queryKey: submitted ? queryKeys.receipt(submitted) : ['receipt', 'empty'],
    queryFn: ({ signal }) => api.getReceipt(submitted as string, signal),
    enabled: submitted !== null
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    const value = input.trim();
    setSubmitted(value === '' ? null : value);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{t('receipt.title')}</h1>
      <p className="prose-civic mt-2">{t('receipt.stub')}</p>

      <form onSubmit={submit} className="card mt-6" aria-labelledby="receipt-heading">
        <h2 id="receipt-heading" className="text-lg font-bold text-navy-900">
          {t('receipt.lookup')}
        </h2>
        <label
          htmlFor="receipt-nullifier"
          className="mt-3 block text-sm font-semibold text-navy-900"
        >
          {t('receipt.nullifierLabel')}
        </label>
        <input
          id="receipt-nullifier"
          name="nullifier"
          autoComplete="off"
          placeholder={t('receipt.placeholder')}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 font-mono text-sm"
        />
        <button type="submit" className="btn-primary mt-3">
          {t('receipt.lookup')}
        </button>
      </form>

      {receiptQuery.isPending && submitted !== null ? (
        <p className="prose-civic mt-4" role="status">
          {t('common.loading')}
        </p>
      ) : null}

      {receiptQuery.isError ? (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
          {t('receipt.lookupError')}
        </p>
      ) : null}

      {receiptQuery.data && !receiptQuery.data.found ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          {t('receipt.notFoundReceipt')}
        </p>
      ) : null}

      {receiptQuery.data?.found ? (
        <dl className="card mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-navy-900">{t('receipt.voteHashLabel')}</dt>
            <dd className="mt-1 break-all font-mono">{receiptQuery.data.voteHash}</dd>
          </div>
          <div>
            <dt className="font-semibold text-navy-900">{t('receipt.txHashLabel')}</dt>
            <dd className="mt-1 break-all font-mono">{receiptQuery.data.txHash}</dd>
          </div>
          {receiptQuery.data.blockNumber !== null ? (
            <div>
              <dt className="font-semibold text-navy-900">{t('receipt.blockLabel')}</dt>
              <dd className="mt-1">{format.number(receiptQuery.data.blockNumber)}</dd>
            </div>
          ) : null}
          {receiptQuery.data.timestamp !== null ? (
            <div>
              <dt className="font-semibold text-navy-900">{t('receipt.timeLabel')}</dt>
              <dd className="mt-1">
                {format.dateTime(new Date(receiptQuery.data.timestamp * 1000), {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
