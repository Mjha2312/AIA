'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { InfoModal, type InfoModalKind } from './info-modals';
import { LanguageSwitcher } from './language-switcher';

function BallotBoxMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden="true">
      <rect x="6" y="18" width="36" height="24" rx="3" fill="#141F52" />
      <rect x="6" y="18" width="36" height="7" rx="3" fill="#1D2E77" />
      <rect x="20" y="12" width="8" height="10" rx="1.5" fill="#141F52" />
      <rect x="13" y="29" width="22" height="3.4" rx="1.7" fill="#C99A2B" />
      <rect x="13" y="35" width="14" height="3" rx="1.5" fill="#fff" opacity="0.85" />
      <g transform="rotate(-18 33 10)">
        <rect x="31.4" y="1" width="3.2" height="14" rx="1.6" fill="#C99A2B" />
        <path d="M33 15l-3.2 4.4h6.4L33 15Z" fill="#127006" />
      </g>
    </svg>
  );
}

function TrustIcon({ kind }: { kind: 'secure' | 'transparent' | 'verifiable' }) {
  if (kind === 'secure') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M8 1l5 2v4c0 3.4-2.2 5.8-5 6.8C5.2 12.8 3 10.4 3 7V3l5-2Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.8 7.6l1.5 1.5 2.9-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'transparent') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v3l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.4 8l1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Single civic navbar (the only header in the layout): government brand,
 * trust indicators, existing functional routes, in-page help anchors and
 * the staff sign-in entry point. Wraps cleanly on small screens.
 */
export function Header() {
  const t = useTranslations();

  const primaryLinks = [
    { href: '/', label: t('nav.home') },
    { href: '/receipt', label: t('nav.receipt') },
    { href: '/explorer', label: t('nav.explorer') },
    { href: '/admin', label: t('nav.admin') }
  ] as const;

  const trustItems = [
    { kind: 'secure' as const, label: t('trust.secure') },
    { kind: 'transparent' as const, label: t('trust.transparent') },
    { kind: 'verifiable' as const, label: t('trust.verifiable') }
  ];

  const infoButtons: { kind: InfoModalKind; label: string }[] = [
    { kind: 'faqs', label: t('nav.faqs') },
    { kind: 'about', label: t('nav.about') },
    { kind: 'help', label: t('nav.help') }
  ];
  const [openModal, setOpenModal] = useState<InfoModalKind | null>(null);

  return (
    <header className="header-frosted">
      <div className="bg-gradient-to-r from-saffron-500 via-white to-green-500" aria-hidden="true">
        <div className="mx-auto h-1 w-full max-w-6xl" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex min-h-touch items-center gap-2.5 rounded-md" aria-label={`${t('brand.title')} — ${t('brand.subtitle')}`}>
          <BallotBoxMark />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-navy-900 sm:text-lg">
              {t('brand.title')}
            </span>
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {t('brand.subtitle')}
            </span>
          </span>
        </Link>

        <div
          aria-label={t('trust.label')}
          className="order-3 flex w-full items-center gap-3 text-xs font-bold uppercase tracking-wide text-navy-700 sm:order-none sm:w-auto sm:text-[13px]"
        >
          {trustItems.map((item) => (
            <span key={item.kind} className="inline-flex items-center gap-1.5">
              <TrustIcon kind={item.kind} />
              {item.label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-1 gap-y-2">
          <nav aria-label={t('nav.primaryLabel')} className="flex flex-wrap items-center">
            <ul className="flex flex-wrap items-center gap-0.5">
              {primaryLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="tap rounded-md px-2.5 py-2 text-[15px] font-medium text-navy-900 hover:bg-white/70 hover:text-navy-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap items-center gap-0.5 border-l border-paleblue-border pl-1">
              {infoButtons.map((item) => (
                <li key={item.kind}>
                  <button
                    type="button"
                    onClick={() => setOpenModal(item.kind)}
                    className="tap rounded-md px-2.5 py-2 text-[15px] text-ink-muted hover:bg-white/70 hover:text-navy-900"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
      {openModal ? <InfoModal kind={openModal} onClose={() => setOpenModal(null)} /> : null}
    </header>
  );
}
