'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Progressive disclosure for technical detail ("Under the hood").
 * shadcn-style collapsible behaviour without a new dependency:
 * a real <button> with aria-expanded + aria-controls, keyboard native.
 */
export function UnderHood({ id, detail }: { id: string; detail: string }) {
  const t = useTranslations('home');
  const [open, setOpen] = useState(false);
  const panelId = `under-hood-${id}`;

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="tap inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-navy-700 hover:bg-navy-50 hover:text-navy-900"
      >
        <span aria-hidden="true" className={`inline-block transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
        {open ? t('underHoodHide') : t('underHood')}
      </button>
      {open ? (
        <p id={panelId} className="mt-1.5 rounded-md border border-navy-100 bg-navy-50 px-3 py-2 text-sm leading-relaxed text-navy-800">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
