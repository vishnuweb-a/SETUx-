import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/government/services/government-service', () => ({
  fetchReviewDashboard: vi.fn(),
  fetchReviewQueue: vi.fn(),
  fetchReviewDetail: vi.fn(),
  submitReviewDecision: vi.fn(),
}));

const service = await import('@/features/government/services/government-service');
const { GovernmentDashboardPage, ReviewDetailPage, ReviewQueuePage } = await import(
  '@/features/government'
);

const mocks = {
  dashboard: vi.mocked(service.fetchReviewDashboard),
  queue: vi.mocked(service.fetchReviewQueue),
  detail: vi.mocked(service.fetchReviewDetail),
  decide: vi.mocked(service.submitReviewDecision),
};

const APPLICATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = '2026-09-05T08:00:00.000Z';

type VerificationStatus = 'VERIFIED' | 'FAILED' | 'REQUIRES_ACTION' | null;

const verification = (
  requirementCode: string,
  information: string,
  status: VerificationStatus,
) => ({ requirementCode, information, required: true, status, reasonCode: null, verifiedAt: null });

const detailPayload = (
  overrides: Partial<{
    status: 'VERIFICATION' | 'APPROVED' | 'REJECTED';
    canDecide: boolean;
    verifications: ReturnType<typeof verification>[];
    review: {
      decision: 'APPROVED' | 'REJECTED';
      reviewerName: string | null;
      remarks: string | null;
      reviewedAt: string;
    } | null;
  }> = {},
) => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000013',
  status: overrides.status ?? 'VERIFICATION',
  submittedAt: NOW,
  updatedAt: NOW,
  service: { code: 'SCHOLARSHIP_MERIT', name: 'National Merit Scholarship', department: 'Higher Education' },
  applicant: {
    fullName: 'Asha Menon',
    governmentId: 'SYN-0001',
    mobileNumber: '9000000001',
    dateOfBirth: '2004-01-01',
  },
  declaredFields: {},
  evidence: [
    {
      sourceName: 'Education Department (Mock)',
      items: [
        {
          fieldCode: 'educationInstitution',
          label: 'Education Institution',
          value: 'University of Delhi',
          sourceName: 'Education Department (Mock)',
          verificationStatus: 'VERIFIED',
          verifiedAt: NOW,
        },
      ],
    },
  ],
  verifications: overrides.verifications ?? [verification('IDENTITY', 'Identity Verification', 'VERIFIED')],
  verificationSummary: { verified: 1, failed: 0, requiresAction: 0, total: 1 },
  review: overrides.review ?? null,
  canDecide: overrides.canDecide ?? true,
});

const renderAt = (element: ReactElement, path: string, route: string) => {
  const router = createMemoryRouter([{ path: route, element }], { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const renderDetail = () =>
  renderAt(<ReviewDetailPage />, `/government/applications/${APPLICATION_ID}`, '/government/applications/:applicationId');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dashboard.mockResolvedValue({
    awaitingReview: 2,
    approved: 3,
    rejected: 1,
    totalReviewed: 4,
    department: 'Higher Education',
    officerName: 'Demo Officer',
  });
  mocks.queue.mockResolvedValue({
    items: [
      {
        applicationId: APPLICATION_ID,
        applicationNumber: 'STX-2026-000013',
        citizenName: 'Asha Menon',
        serviceName: 'National Merit Scholarship',
        status: 'VERIFICATION',
        submittedAt: NOW,
        updatedAt: NOW,
        verificationSummary: { verified: 3, failed: 0, requiresAction: 1, total: 4 },
        decision: null,
      },
    ],
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
  });
  mocks.detail.mockResolvedValue(detailPayload());
});

describe('officer dashboard', () => {
  it('renders counts from the API rather than hard-coded demo values', async () => {
    renderAt(<GovernmentDashboardPage />, '/government', '/government');

    expect(await screen.findByText('Demo Officer · Higher Education')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('Approved').closest('div')).toHaveTextContent('3');
    expect(screen.getByText('Rejected').closest('div')).toHaveTextContent('1');
    expect(screen.getByText('Total reviewed').closest('div')).toHaveTextContent('4');
    expect(mocks.dashboard).toHaveBeenCalled();
  });
});

describe('review queue', () => {
  it('renders real API results, not placeholders', async () => {
    renderAt(<ReviewQueuePage />, '/government/applications', '/government/applications');

    // The queue renders the same rows twice — a table at desktop widths and
    // cards below — so every row assertion is a getAllBy.
    expect((await screen.findAllByText('STX-2026-000013')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Asha Menon').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Awaiting review/).length).toBeGreaterThan(0);
    // Counts, never a verdict.
    expect(screen.getAllByText(/of 4 verified/).length).toBeGreaterThan(0);
  });

  it('shows an empty state when nothing is waiting', async () => {
    mocks.queue.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });

    renderAt(<ReviewQueuePage />, '/government/applications', '/government/applications');

    expect(await screen.findByText('Nothing is waiting for review')).toBeInTheDocument();
  });
});

describe('application detail', () => {
  it('renders evidence with its provenance and no raw JSON', async () => {
    renderDetail();

    expect(await screen.findByText('STX-2026-000013')).toBeInTheDocument();
    expect(screen.getByText('Education Department (Mock)')).toBeInTheDocument();
    expect(screen.getByText('Education Institution')).toBeInTheDocument();
    expect(screen.getByText('University of Delhi')).toBeInTheDocument();
    // The applicant panel, not a data dump.
    expect(screen.getByText('Asha Menon')).toBeInTheDocument();
  });

  it('renders VERIFIED as "Verified"', async () => {
    renderDetail();

    expect(await screen.findByText('Verified')).toBeInTheDocument();
  });

  it('renders FAILED as "Could not be verified", never as rejected', async () => {
    mocks.detail.mockResolvedValue(
      detailPayload({ verifications: [verification('INCOME_RECORD', 'Income Certificate', 'FAILED')] }),
    );

    renderDetail();

    expect(await screen.findByText('Could not be verified')).toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
  });

  it('renders REQUIRES_ACTION as "Needs officer review", never as a failure', async () => {
    mocks.detail.mockResolvedValue(
      detailPayload({
        verifications: [verification('COMMUNITY_RECORD', 'Community Record', 'REQUIRES_ACTION')],
      }),
    );

    renderDetail();

    // The distinction that demonstrates why a human officer exists in SetuX.
    expect(await screen.findByText('Needs officer review')).toBeInTheDocument();
    expect(screen.queryByText('Could not be verified')).not.toBeInTheDocument();
  });
});

describe('approve and reject', () => {
  it('confirms before approving and submits only the decision', async () => {
    const user = userEvent.setup();
    mocks.decide.mockResolvedValue(
      detailPayload({
        status: 'APPROVED',
        canDecide: false,
        review: { decision: 'APPROVED', reviewerName: 'Demo Officer', remarks: null, reviewedAt: NOW },
      }),
    );

    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/will be recorded as approved/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Approve application' }));

    await waitFor(() => {
      expect(mocks.decide).toHaveBeenCalledWith(APPLICATION_ID, { decision: 'APPROVED' });
    });
  });

  it('requires a reason before a rejection can be submitted', async () => {
    const user = userEvent.setup();

    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject application' });

    // Disabled until a reason exists — the citizen must be told why.
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('Reason for rejection'),
      'Income exceeds the scheme threshold.',
    );
    expect(confirm).toBeEnabled();

    mocks.decide.mockResolvedValue(
      detailPayload({
        status: 'REJECTED',
        canDecide: false,
        review: {
          decision: 'REJECTED',
          reviewerName: 'Demo Officer',
          remarks: 'Income exceeds the scheme threshold.',
          reviewedAt: NOW,
        },
      }),
    );
    await user.click(confirm);

    await waitFor(() => {
      expect(mocks.decide).toHaveBeenCalledWith(APPLICATION_ID, {
        decision: 'REJECTED',
        remarks: 'Income exceeds the scheme threshold.',
      });
    });
  });

  it('renders a finalized application read-only, with no decision controls', async () => {
    mocks.detail.mockResolvedValue(
      detailPayload({
        status: 'APPROVED',
        canDecide: false,
        review: {
          decision: 'APPROVED',
          reviewerName: 'Demo Officer',
          remarks: 'Meets every criterion.',
          reviewedAt: NOW,
        },
      }),
    );

    renderDetail();

    // Scoped to the decision summary: "Approved" also appears in the status
    // badge, and the point here is that the summary states who decided and when.
    const summary = await screen.findByText('Meets every criterion.');
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/by Demo Officer/)).toBeInTheDocument();
    // Removed entirely rather than disabled: there is no action left to take.
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});

/**
 * Which status each tab ASKS THE API for.
 *
 * The repository can list every non-DRAFT application in the department, so the
 * queue is only as narrow as the status it sends. These tests pin the request
 * itself rather than the rendered rows: a tab that fetched everything and
 * filtered in the browser would still look correct on screen while paging
 * through — and eventually showing — applications an officer cannot act on.
 */
describe('review queue — status semantics', () => {
  const openTab = (status?: string) =>
    renderAt(
      <ReviewQueuePage />,
      `/government/applications${status ? `?status=${status}` : ''}`,
      '/government/applications',
    );

  const requestedStatuses = () => mocks.queue.mock.calls.map(([status]) => status);

  it('requests VERIFICATION for Awaiting review, which is also the default tab', async () => {
    openTab();

    await waitFor(() => expect(mocks.queue).toHaveBeenCalled());
    expect(requestedStatuses()).toEqual(['VERIFICATION']);
    // Never the broad non-DRAFT query.
    expect(requestedStatuses()).not.toContain(undefined);
  });

  it.each(['SUBMITTED', 'APPROVED', 'REJECTED'] as const)(
    'never requests %s while on Awaiting review',
    async (status) => {
      openTab();

      await waitFor(() => expect(mocks.queue).toHaveBeenCalled());
      expect(requestedStatuses()).not.toContain(status);
    },
  );

  it.each(['APPROVED', 'REJECTED'] as const)('requests %s for its own tab', async (status) => {
    openTab(status);

    await waitFor(() => expect(mocks.queue).toHaveBeenCalled());
    expect(requestedStatuses()).toEqual([status]);
  });

  it('offers no tab that would list applications an officer cannot act on', async () => {
    openTab();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Awaiting review',
      'Approved',
      'Rejected',
    ]);
  });

  it('falls back to VERIFICATION when the URL carries a status the queue does not offer', async () => {
    // A hand-typed ?status=SUBMITTED must not become a broad or invalid request:
    // the backend rejects that filter with a 400, and the officer would see an
    // error where the awaiting-review list belongs.
    openTab('SUBMITTED');

    await waitFor(() => expect(mocks.queue).toHaveBeenCalled());
    expect(requestedStatuses()).toEqual(['VERIFICATION']);
  });

  /**
   * Each tab carries its status in the URL, and the URL is what the request is
   * built from. Asserted by rendering at each tab's own address rather than by
   * clicking through: `setSearchParams` navigation aborts under jsdom's fetch,
   * which would test the harness rather than the mapping.
   */
  it('maps every tab to the status its own URL requests', async () => {
    const tabs = [
      { label: 'Awaiting review', status: 'VERIFICATION' },
      { label: 'Approved', status: 'APPROVED' },
      { label: 'Rejected', status: 'REJECTED' },
    ] as const;

    for (const tab of tabs) {
      vi.clearAllMocks();
      const view = openTab(tab.status);

      await waitFor(() => expect(mocks.queue).toHaveBeenCalled());
      expect(requestedStatuses()).toEqual([tab.status]);
      expect(
        within(view.container).getByRole('tab', { name: tab.label }),
      ).toHaveAttribute('aria-selected', 'true');

      view.unmount();
    }
  });
});

describe('application detail — decision actions follow the server', () => {
  it('offers no decision actions on an application that is only SUBMITTED', async () => {
    // canDecide is server-derived. A SUBMITTED application has not completed
    // verification, so the server reports false and the browser renders that
    // rather than deciding for itself.
    mocks.detail.mockResolvedValue({
      ...detailPayload({ canDecide: false }),
      status: 'SUBMITTED',
    });

    renderDetail();

    expect(await screen.findByText('STX-2026-000013')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'renders a %s application read-only',
    async (status) => {
      mocks.detail.mockResolvedValue(
        detailPayload({
          status,
          canDecide: false,
          review: {
            decision: status,
            reviewerName: 'Demo Officer',
            remarks: status === 'REJECTED' ? 'Income exceeds the threshold.' : null,
            reviewedAt: NOW,
          },
        }),
      );

      renderDetail();

      expect(await screen.findByText('STX-2026-000013')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    },
  );
});
