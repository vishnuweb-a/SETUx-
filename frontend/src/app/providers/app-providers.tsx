import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/feedback/error-boundary';
import { ApiError } from '@/services/api-client';

/** Client errors (4xx) are the caller's fault; retrying them wastes a round trip. */
const MAX_QUERY_RETRIES = 2;

const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_QUERY_RETRIES;
};

/**
 * Global client-side providers.
 *
 * Feature phases add their own providers here (auth session, theme, toasts)
 * rather than wrapping individual routes. Business logic does not belong in
 * this file.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Created in state so the client survives fast-refresh without being shared
  // across React roots.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetry,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ErrorBoundary>
  );
}
