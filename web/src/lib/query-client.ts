import { QueryClient } from '@tanstack/react-query';

/**
 * Fresh client per request on the server, shared one in the browser, so a
 * server render never leaks data between users.
 */
let browserQueryClient: QueryClient | undefined;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false
      }
    }
  });
}

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}