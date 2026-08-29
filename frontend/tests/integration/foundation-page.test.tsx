import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoundationPage } from '@/app/pages/foundation-page';

/** Fresh client per test so one test's cache never satisfies another's query. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return render(<FoundationPage />, { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FoundationPage — frontend/backend integration', () => {
  it('shows a loading state while the health request is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/contacting the setux api/i);
  });

  it('renders the health payload returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              service: 'setux-backend',
              status: 'healthy',
              environment: 'test',
              uptimeSeconds: 12,
              timestamp: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText(/setux-backend is healthy/i)).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
  });

  it('renders an error state with a retry action when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('surfaces the request id from a backend error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Service unavailable.', requestId: 'req_9' },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText(/req_9/)).toBeInTheDocument();
  });
});
