'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Lightweight shadcn-style hash row: monospace value + copy button.
 * No private material may be passed here — callers only render public
 * voteHash / txHash / nullifier receipt values.
 */
export function HashValue({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const rowId = testId ?? `hash-${label.replace(/\s+/g, '-').toLowerCase()}`;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be unavailable (permissions, non-secure context):
      // fall back to a transient textarea select+copy.
      try {
        const area = document.createElement('textarea');
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div data-testid={rowId} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-semibold text-navy-900">{label}</dt>
        <dd className="hash-value mt-1 rounded-md bg-slate-50 px-2.5 py-1.5">{value}</dd>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-live="polite"
        aria-label={`${t('common.copy')}: ${label}`}
        className="btn-secondary mt-1 shrink-0 px-3 py-1.5 text-sm sm:mt-6"
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}
