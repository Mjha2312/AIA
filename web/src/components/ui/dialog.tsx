'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * shadcn/ui Dialog composition on Radix primitives: Dialog (root),
 * DialogContent (overlay + panel + X close), DialogHeader and DialogTitle.
 * Radix provides the focus trap, Escape handling, outside-click close and
 * accessible title wiring; styling follows the civic system (white surface,
 * dark text, X close top right).
 */
export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({
  children,
  wide = false,
  showClose = true,
  onClose,
  onEscapeKeyDown,
  onPointerDownOutside
}: {
  children: ReactNode;
  /** Roomier panel for content-heavy modals such as the FAQ accordion. */
  wide?: boolean;
  /** Hide the X button (e.g. while a vote transaction is in flight). */
  showClose?: boolean;
  onClose?: () => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: CustomEvent) => void;
}) {
  const t = useTranslations();

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-900/45" />
      <DialogPrimitive.Content
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        className={`fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] ${
          wide ? 'max-w-lg' : 'max-w-md'
        } -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 text-ink shadow-xl focus:outline-none`}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            onClick={onClose}
            aria-label={t('common.close')}
            className="tap absolute right-4 top-4 rounded-md px-2 text-ink-muted hover:bg-slate-100 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 pr-8 text-left">{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Title className={className ?? 'text-lg font-bold leading-none tracking-tight text-navy-900'}>
      {children}
    </DialogPrimitive.Title>
  );
}
