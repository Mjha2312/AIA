'use client';

import { type ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  // Created inside the client boundary: a QueryClient is a class instance and
  // cannot cross from a server component into a client component.
  const [queryClient] = useState(getQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}