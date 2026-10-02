'use client';

import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

import { wagmiConfig } from '@/lib/wagmi';

/**
 * The wallet only ever loads under `/admin`: voters do not sign anything
 * (SPEC: votes are relayed by the backend), so keeping wagmi out of the voter
 * bundle saves hundreds of kilobytes on a low-end phone.
 */
export function AdminProviders({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}