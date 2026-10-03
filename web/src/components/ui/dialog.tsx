'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Minimal accessible modal (shadcn Dialog pattern without the dependency).
 * Focuses the dialog on open, closes on Escape, restores focus on unmount.
 * Keep the dependency footprint at zero for low-end phones.
 */
export function Dialog({
  title,
  onClose,
  children,
  labelledBy = 'dialog-title'
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const t = useTranslations();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/45 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={labelledBy} className="text-lg font-bold text-navy-900">
            {title}
          </h2>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="tap rounded-md px-2 text-xl leading-none text-ink-muted hover:bg-slate-100 hover:text-ink"
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
