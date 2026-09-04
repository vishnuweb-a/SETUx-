import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/retrievals/services/retrieval-service', () => ({
  fetchApplicationRetrievals: vi.fn(),
  createApplicationRetrieval: vi.fn(),
}));

const service = await import('@/features/retrievals/services/retrieval-service');
const { RetrievalPanel } = await import('@/features/retrievals');
const { ApiError } = await import('@/services/api-client');

const mocks = {
  fetch: vi.mocked(service.fetchApplicationRetrievals),
  create: vi.mocked(service.createApplicationRetrieval),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUIREMENT_ID = '44444444-4444-4444-8444-444444444444';
const RETRIEVED_AT = '2026-09-04T09:00:00.000Z';

type Availability =
  | 'AVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_DENIED'
  | 'COMPLETED'
  | 'RETRYABLE'
  | 'NOT_SUPPORTED';

const item = (availability: Availability, overrides: Partial<{ failureReason: string | null }> = {}) => ({
  requirementId: REQUIREMENT_ID,
  requirementCode: 'BANK_DETAILS',
  information: 'Bank Account Proof',
  source: 'DigiLocker (Mock)',
  isSimulated: true,
  availability,
  status: availability === 'COMPLETED' ? ('SUCCESS' as const) : availability === 'RETRYABLE' ? ('FAILED' as const) : null,
  documentType: availability === 'COMPLETED' ? 'BANK_ACCOUNT_PROOF' : null,
  providerReference: availability === 'COMPLETED' ? 'SYNTH-DL-ABCDEF123456' : null,
  issuer: availability === 'COMPLETED' ? 'Demo Public Bank (Simulated)' : null,
  retrievedAt: availability === 'COMPLETED' ? RETRIEVED_AT : null,
  values:
    availability === 'COMPLETED'
      ? [
          { label: 'Account number', value: 'XXXXXX4409' },
          { label: 'Account holder', value: 'Demo Citizen' },
        ]
      : [],
  failureReason:
    overrides.failureReason ??
    (availability === 'RETRYABLE' ? 'The simulated DigiLocker service did not respond.' : null),
});

const payload = (items: ReturnType<typeof item>[]) => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000001',
  serviceName: 'National Merit Scholarship',
  items,
});

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/citizen/applications/:applicationId',
        element: <RetrievalPanel applicationId={APPLICATION_ID} />,
      },
      { path: '/citizen/applications/:applicationId/consent', element: <p>Consent page</p> },
    ],
    { initialEntries: [`/citizen/applications/${APPLICATION_ID}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const fetchButton = () => screen.getByRole('button', { name: /fetch from/iu });
/**
 * The status badge, not the "Retrieved" label on the timestamp field. Both
 * legitimately carry the word, so the badge is matched by its exact text on a
 * single element.
 */
const badge = (label: string) =>
  screen.findByText((_, element) => element?.textContent?.trim() === label && element.tagName === 'SPAN');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue(payload([item('AVAILABLE')]));
});

describe('the retrieval call to action', () => {
  it('is offered once consent has been granted', async () => {
    renderPanel();
    expect(await screen.findByRole('button', { name: /fetch from DigiLocker/iu })).toBeVisible();
  });

  it('is not offered while consent is still pending', async () => {
    mocks.fetch.mockResolvedValue(payload([item('CONSENT_REQUIRED')]));
    renderPanel();
    await screen.findByText('Bank Account Proof');
    expect(screen.queryByRole('button', { name: /fetch from/iu })).not.toBeInTheDocument();
  });

  it('directs the citizen to the consent page when a decision is outstanding', async () => {
    mocks.fetch.mockResolvedValue(payload([item('CONSENT_REQUIRED')]));
    renderPanel();
    expect(await screen.findByRole('link', { name: /review consent/iu })).toBeVisible();
  });

  it('is not offered after the citizen denied consent', async () => {
    mocks.fetch.mockResolvedValue(payload([item('CONSENT_DENIED')]));
    renderPanel();
    expect(await screen.findByText(/you denied consent for this/iu)).toBeVisible();
    expect(screen.queryByRole('button', { name: /fetch from/iu })).not.toBeInTheDocument();
  });

  it('is not offered once the document has been retrieved', async () => {
    mocks.fetch.mockResolvedValue(payload([item('COMPLETED')]));
    renderPanel();
    await badge('Retrieved');
    expect(screen.queryByRole('button', { name: /fetch from/iu })).not.toBeInTheDocument();
  });

  it('is not offered for a system SetuX has not connected yet', async () => {
    mocks.fetch.mockResolvedValue(payload([item('NOT_SUPPORTED')]));
    renderPanel();
    expect(await screen.findByText(/not connected to SetuX yet/iu)).toBeVisible();
    expect(screen.queryByRole('button', { name: /fetch from/iu })).not.toBeInTheDocument();
  });
});

describe('performing a retrieval', () => {
  it('sends only the requirement id', async () => {
    mocks.create.mockResolvedValue(payload([item('COMPLETED')]));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /fetch from/iu }));
    expect(mocks.create).toHaveBeenCalledWith(APPLICATION_ID, REQUIREMENT_ID);
  });

  it('communicates the pending state while it runs', async () => {
    let resolve: (value: ReturnType<typeof payload>) => void = () => {};
    mocks.create.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /fetch from/iu }));

    const busy = await screen.findByRole('button', { name: /fetching/iu });
    // aria-busy, not only a label change, so the state reaches assistive tech.
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();

    resolve(payload([item('COMPLETED')]));
    expect(await badge('Retrieved')).toBeVisible();
  });

  it('shows the retrieved document and its values on success', async () => {
    mocks.create.mockResolvedValue(payload([item('COMPLETED')]));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /fetch from/iu }));

    expect(await badge('Retrieved')).toBeVisible();
    expect(screen.getByText('XXXXXX4409')).toBeVisible();
    expect(screen.getByText('Demo Public Bank (Simulated)')).toBeVisible();
    expect(screen.getByText(/SYNTH-DL-ABCDEF123456/u)).toBeVisible();
  });

  it('names the source and marks it simulated', async () => {
    renderPanel();
    // The row names the source; so does the button. Both are correct.
    expect(await screen.findByRole('button', { name: /fetch from DigiLocker \(Mock\)/iu })).toBeVisible();
    expect(screen.getByText(/DigiLocker \(Mock\) · Simulated/u)).toBeVisible();
  });
});

describe('failure', () => {
  it('reports a provider failure as an alert and offers a retry', async () => {
    mocks.create.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'RETRIEVAL_PROVIDER_FAILED',
        message: 'The government system did not respond. You can try again.',
      }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /fetch from/iu }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not respond/iu);
    // Still actionable — the button is not left disabled after a failure.
    expect(fetchButton()).toBeEnabled();
  });

  it('offers a retry for a previously failed attempt', async () => {
    mocks.fetch.mockResolvedValue(payload([item('RETRYABLE')]));
    renderPanel();
    expect(await screen.findByRole('button', { name: /try again/iu })).toBeEnabled();
    expect(screen.getByText(/did not respond/iu)).toBeVisible();
  });

  it('shows no retrieved values after a failure', async () => {
    mocks.fetch.mockResolvedValue(payload([item('RETRYABLE')]));
    renderPanel();
    await screen.findByText('Could not fetch');
    expect(screen.queryByText('XXXXXX4409')).not.toBeInTheDocument();
  });

  it('exposes no technical detail for an unexpected error', async () => {
    mocks.create.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'ECONNREFUSED at Object.<anonymous>' }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /fetch from/iu }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The request could not be completed. Please try again.');
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/u);
  });

  it('renders an error state when the panel itself cannot load', async () => {
    mocks.fetch.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom' }));
    renderPanel();
    expect(await screen.findByText(/could not load your documents/iu)).toBeVisible();
  });
});

describe('persistence and wording', () => {
  it('shows the retrieved state on a fresh load, without re-fetching from the provider', async () => {
    mocks.fetch.mockResolvedValue(payload([item('COMPLETED')]));
    renderPanel();
    expect(await badge('Retrieved')).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('never claims the document is verified', async () => {
    mocks.fetch.mockResolvedValue(payload([item('COMPLETED')]));
    const { container } = renderPanel();
    await badge('Retrieved');
    // Verification belongs to a later phase; Phase 8 must not imply it.
    expect(container.textContent).not.toMatch(/verified/iu);
  });

  it('says plainly that the systems are simulated', async () => {
    renderPanel();
    expect(await screen.findByText(/simulated government systems/iu)).toBeVisible();
  });

  it('renders nothing when the service needs no external documents', async () => {
    mocks.fetch.mockResolvedValue(payload([]));
    const { container } = renderPanel();
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });

  it('gives the panel one accessible heading', async () => {
    renderPanel();
    expect(
      await screen.findByRole('heading', { name: /documents from government systems/iu }),
    ).toBeVisible();
  });
});
