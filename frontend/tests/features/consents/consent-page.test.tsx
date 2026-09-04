import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/consents/services/consent-service', () => ({
  fetchApplicationConsents: vi.fn(),
  grantConsent: vi.fn(),
  denyConsent: vi.fn(),
}));

const service = await import('@/features/consents/services/consent-service');
const { ConsentPage } = await import('@/features/consents/pages/consent-page');
const { ApiError } = await import('@/services/api-client');

const mocks = {
  fetch: vi.mocked(service.fetchApplicationConsents),
  grant: vi.mocked(service.grantConsent),
  deny: vi.mocked(service.denyConsent),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CONSENT_ID = '44444444-4444-4444-8444-444444444444';
const DECIDED_AT = '2026-09-04T09:00:00.000Z';

const APPLICATION = {
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000001',
  serviceName: 'National Merit Scholarship',
  recipient: 'Education',
  applicationStatus: 'SUBMITTED',
};

const consent = (overrides: Partial<{ status: 'PENDING' | 'GRANTED' | 'DENIED'; decidedAt: string | null }> = {}) => ({
  id: CONSENT_ID,
  applicationId: APPLICATION_ID,
  information: 'Income Certificate',
  description: 'Annual family income.',
  source: 'Income & Revenue Department (Mock)',
  purpose: 'Verify Income Certificate for your National Merit Scholarship application',
  status: overrides.status ?? ('PENDING' as const),
  decidedAt: overrides.decidedAt ?? null,
});

const payload = (overrides: Partial<{ consents: ReturnType<typeof consent>[] }> = {}) => {
  const consents = overrides.consents ?? [consent()];
  return {
    application: APPLICATION,
    consents,
    isDecisionRequired: consents.some((item) => item.status === 'PENDING'),
  };
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/citizen/applications/:applicationId/consent', element: <ConsentPage /> }],
    { initialEntries: [`/citizen/applications/${APPLICATION_ID}/consent`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue(payload());
  mocks.grant.mockResolvedValue(payload({ consents: [consent({ status: 'GRANTED', decidedAt: DECIDED_AT })] }));
  mocks.deny.mockResolvedValue(payload({ consents: [consent({ status: 'DENIED', decidedAt: DECIDED_AT })] }));
});

describe('consent page', () => {
  it('shows what is requested, from where, and why', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /review and grant consent/i })).toBeInTheDocument();
    // Rendered twice — once in the table, once in the stacked mobile list.
    expect(screen.getAllByText('Income Certificate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Income & Revenue Department (Mock)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/verify income certificate for your national merit scholarship/i).length).toBeGreaterThan(0);
  });

  it('names the application and the recipient the data would go to', async () => {
    renderPage();
    expect(await screen.findByText('STX-2026-000001')).toBeInTheDocument();
    expect(screen.getAllByText(/education/i).length).toBeGreaterThan(0);
  });

  it('exposes exactly one level-one heading', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('grants only when the citizen explicitly allows', async () => {
    const user = userEvent.setup();
    renderPage();
    const allow = (await screen.findAllByRole('button', { name: /^allow/i }))[0]!;

    // Rendering the page must not have decided anything.
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.deny).not.toHaveBeenCalled();

    await user.click(allow);
    await waitFor(() => expect(mocks.grant).toHaveBeenCalledWith(CONSENT_ID));
    expect(await screen.findAllByText(/allowed/i)).not.toHaveLength(0);
  });

  it('shows the decision timestamp once granted', async () => {
    mocks.fetch.mockResolvedValue(payload({ consents: [consent({ status: 'GRANTED', decidedAt: DECIDED_AT })] }));
    renderPage();
    expect(await screen.findAllByText(new Date(DECIDED_AT).toLocaleString())).not.toHaveLength(0);
  });

  it('offers no further action on a decided consent', async () => {
    mocks.fetch.mockResolvedValue(payload({ consents: [consent({ status: 'GRANTED', decidedAt: DECIDED_AT })] }));
    renderPage();
    await screen.findAllByText(/allowed/i);
    expect(screen.queryByRole('button', { name: /^allow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^deny/i })).not.toBeInTheDocument();
  });

  it('confirms before denying, and does nothing if the citizen backs out', async () => {
    const user = userEvent.setup();
    renderPage();
    const deny = (await screen.findAllByRole('button', { name: /^deny/i }))[0]!;
    await user.click(deny);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot be verified without this information/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /go back/i }));
    expect(mocks.deny).not.toHaveBeenCalled();
  });

  it('denies once the citizen confirms', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: /^deny/i }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /deny access/i }));

    await waitFor(() => expect(mocks.deny).toHaveBeenCalledWith(CONSENT_ID));
    expect(await screen.findAllByText(/denied/i)).not.toHaveLength(0);
  });

  it('keeps the deny dialog keyboard operable', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: /^deny/i }))[0]!);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.deny).not.toHaveBeenCalled();
  });

  it('reports a rejected decision without claiming it succeeded', async () => {
    const user = userEvent.setup();
    mocks.grant.mockRejectedValue(
      new ApiError({ status: 409, code: 'CONSENT_ALREADY_DECIDED', message: 'You have already responded to this consent request.' }),
    );
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: /^allow/i }))[0]!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/already responded/i);
    expect(screen.getAllByRole('button', { name: /^allow/i }).length).toBeGreaterThan(0);
  });

  it('explains a failed load and offers a retry', async () => {
    mocks.fetch.mockRejectedValue(new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Not found.' }));
    renderPage();
    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says so plainly when no consent is needed', async () => {
    mocks.fetch.mockResolvedValue(payload({ consents: [] }));
    renderPage();
    expect(await screen.findByText(/no consent needed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^allow/i })).not.toBeInTheDocument();
  });

  it('confirms nothing is retrieved once every request is answered', async () => {
    mocks.fetch.mockResolvedValue(payload({ consents: [consent({ status: 'DENIED', decidedAt: DECIDED_AT })] }));
    renderPage();
    expect(await screen.findByText(/will not retrieve any information you did not allow/i)).toBeInTheDocument();
  });

  it('presents allow and deny as equally reachable buttons', async () => {
    renderPage();
    const allow = (await screen.findAllByRole('button', { name: /^allow/i }))[0]!;
    const deny = screen.getAllByRole('button', { name: /^deny/i })[0]!;
    // Both are real buttons, neither hidden or disabled — no dark pattern that
    // makes refusing harder than agreeing.
    expect(allow).toBeEnabled();
    expect(deny).toBeEnabled();
    expect(deny.tagName).toBe(allow.tagName);
  });
});
