'use client';

import { useState, type ReactNode } from 'react';

/**
 * Minimal accessible accordion (shadcn Accordion pattern without the
 * dependency). One panel open at a time; every header is a real <button>
 * with aria-expanded/aria-controls, so keyboard and screen-reader users
 * get the same behaviour as mouse users.
 */
export function Accordion({ items }: { items: { id: string; question: ReactNode; answer: ReactNode }[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-cream-border rounded-lg border border-cream-border">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`accordion-panel-${item.id}`}
                id={`accordion-button-${item.id}`}
                onClick={() => setOpenId(open ? null : item.id)}
                className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] font-bold text-navy-900 hover:bg-cream"
              >
                <span>{item.question}</span>
                <span aria-hidden="true" className={`shrink-0 text-gold-600 transition-transform duration-150 ${open ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
            </h3>
            {open ? (
              <div
                id={`accordion-panel-${item.id}`}
                role="region"
                aria-labelledby={`accordion-button-${item.id}`}
                className="px-4 pb-4 text-[15px] leading-relaxed text-ink-muted"
              >
                {item.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
