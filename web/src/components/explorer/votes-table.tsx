'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { api } from '@/lib/api';
import type { Vote } from '@/lib/schemas';

const PAGE_LIMIT = 25;

/**
 * Public vote ledger for one election. Pages append ("Load more") because the
 * cursor is opaque; the search box filters whatever has been loaded so far.
 */
export function VotesTable({ electionId, candidates }: { electionId: string; candidates: string[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const [items, setItems] = useState<Vote[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  // Bumped to retry the ledger fetch in place — never a full page reload.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setNextCursor(null);
    setLoading(true);
    setError(false);
    api
      .getVotes(electionId, { limit: PAGE_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [electionId, reloadKey]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.getVotes(electionId, { cursor: nextCursor, limit: PAGE_LIMIT });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor ?? null);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle.length === 0
        ? items
        : items.filter(
            (item) =>
              item.nullifier.toLowerCase().includes(needle) ||
              item.voteHash.toLowerCase().includes(needle)
          ),
    [items, needle]
  );

  if (loading) return <p className="prose-civic mt-3">{t('common.loading')}</p>;
  if (error && items.length === 0) {
    return (
      <div className="mt-3">
        <p className="prose-civic" role="alert">{t('explorer.loadError')}</p>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label className="block text-sm font-semibold text-navy-900" htmlFor={`vote-search-${electionId}`}>
        {t('explorer.searchLabel')}
      </label>
      <input
        id={`vote-search-${electionId}`}
        type="search"
        className="mt-1 min-h-touch w-full max-w-md rounded-md border border-navy-300 px-3 py-2 text-base text-ink"
        placeholder={t('explorer.searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {visible.length === 0 ? (
        <p className="prose-civic mt-3">
          {items.length === 0 ? t('explorer.votesEmpty') : t('explorer.searchEmpty', { query: query.trim() })}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <caption className="sr-only">{t('explorer.votesTitle')}</caption>
            <thead>
              <tr>
                {[t('explorer.colVoteHash'), t('explorer.colNullifier'), t('explorer.colCandidate'), t('explorer.colTxHash'), t('explorer.colBlock'), t('explorer.colTime')].map(
                  (heading) => (
                    <th key={heading} scope="col" className="border border-navy-200 bg-navy-50 px-2 py-1 text-left">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.voteHash}>
                  <td className="border border-navy-200 px-2 py-1 font-mono text-xs" title={item.voteHash}>
                    {shortHash(item.voteHash)}
                  </td>
                  <td className="border border-navy-200 px-2 py-1 font-mono text-xs" title={item.nullifier}>
                    {shortHash(item.nullifier)}
                  </td>
                  <td className="border border-navy-200 px-2 py-1">
                    {candidates[item.candidateIndex] ?? `#${item.candidateIndex}`}
                  </td>
                  <td className="border border-navy-200 px-2 py-1 font-mono text-xs" title={item.txHash}>
                    {shortHash(item.txHash)}
                  </td>
                  <td className="border border-navy-200 px-2 py-1 text-right">
                    {format.number(item.blockNumber)}
                  </td>
                  <td className="border border-navy-200 px-2 py-1">
                    {format.dateTime(new Date(item.timestamp * 1000), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="prose-civic text-sm">{t('explorer.showingCount', { count: items.length })}</p>
        {nextCursor && (
          <button type="button" className="btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('explorer.loadMore')}
          </button>
        )}
      </div>
      {error && items.length > 0 && (
        <p className="prose-civic mt-2 text-sm" role="alert">{t('explorer.loadError')}</p>
      )}
    </div>
  );
}

export function shortHash(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
