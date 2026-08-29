import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Global client-side providers.
 *
 * Feature phases add their own providers here (auth session, theme, toasts)
 * rather than wrapping individual routes.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Created in state so the client survives fast-refresh without being shared
  // across React roots.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
