import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/applications/services/application-service', () => ({
  fetchApplication: vi.fn(),
  fetchApplications: vi.fn(),
  createApplication: vi.fn(),
  saveApplication: vi.fn(),
  submitApplication: vi.fn(),
}));
vi.mock('@/features/consents/services/consent-service', () => ({
  fetchApplicationConsents: vi.fn(),
  grantConsent: vi.fn(),
  denyConsent: vi.fn(),
}));
vi.mock('@/features/retrievals/services/retrieval-service', () => ({
  fetchApplicationRetrievals: vi.fn(),
  createApplicationRetrieval: vi.fn(),
}));
vi.mock('@/features/verifications/services/verification-service', () => ({
  fetchApplicationVerification: vi.fn(),
  startApplicationVerification: vi.fn(),
}));

const applicationService = await import('@/features/applications/services/application-service');
const consentService = await import('@/features/consents/services/consent-service');
const retrievalService = await import('@/features/retrievals/services/retrieval-service');
const verificationService = await import(
  '@/features/verifications/services/verification-service'
);
const { ApplicationDetailPage } = await import(
  '@/features/applications/pages/application-detail-page'
);

const mocks = {
  application: vi.mocked(applicationService.fetchApplication),
  consents: vi.mocked(consentService.fetchApplicationConsents),
  retrievals: vi.mocked(retrievalService.fetchApplicationRetrievals),
  verification: vi.mocked(verificationService.fetchApplicationVerification),
  start: vi.mocked(verificationService.startApplicationVerification),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUIREMENT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-09-05T08:00:00.000Z';

type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFICATION';

const application = (status: ApplicationStatus) => ({
  id: APPLICATION_ID,
  applicationNumber: 'STX-2026-000013',
  service: {
    id: 's',
    code: 'SCHOLARSHIP_MERIT',
    name: 'National Merit Scholarship',
    department: 'Education',
  },
  status,
  createdAt: NOW,
  updatedAt: NOW,
  submittedAt: status === 'DRAFT' ? null : NOW,
  applicant: {
    fullName: 'Demo Citizen',
    governmentId: 'SYNTH-0001',
    mobileNumber: '9000000000',
    dateOfBirth: '2004-01-01',
  },
  requirements: [
    {
      id: REQUIREMENT_ID,
      code: 'IDENTITY',
      name: 'Identity Verification',
      description: 'Identity registry check.',
      type: 'DOCUMENT' as const,
      source: 'Identity Registry (Mock)',
      required: true,
      displayOrder: 1,
    },
  ],
  fields: {},
});

const verificationPayload = (
  readiness: 'READY' | 'ALREADY_STARTED' | 'EVIDENCE_INCOMPLETE',
  status: 'VERIFIED' | null = null,
) => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000013',
  serviceName: 'National Merit Scholarship',
  readiness,
  items: [
    {
      requirementCode: 'IDENTITY',
      information: 'Identity Verification',
      required: true,
      status,
      reasonCode: status === 'VERIFIED' ? ('RULE_MATCH' as const) : null,
      verifiedAt: status === 'VERIFIED' ? NOW : null,
    },
  ],
  verifiedCount: status === 'VERIFIED' ? 1 : 0,
  totalCount: 1,
});

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/citizen/applications/:applicationId', element: <ApplicationDetailPage /> },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.application.mockResolvedValue(application('SUBMITTED'));
  mocks.consents.mockResolvedValue({
    application: {
      applicationId: APPLICATION_ID,
      applicationNumber: 'STX-2026-000013',
      serviceName: 'National Merit Scholarship',
      recipient: 'Education',
      applicationStatus: 'SUBMITTED',
    },
    consents: [],
    isDecisionRequired: false,
  });
  mocks.retrievals.mockResolvedValue({
    applicationId: APPLICATION_ID,
    applicationNumber: 'STX-2026-000013',
    serviceName: 'National Merit Scholarship',
    items: [],
  });
  mocks.verification.mockResolvedValue(verificationPayload('READY'));
});

describe('verification on the application page', () => {
  it('shows the verification overview on a submitted application', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /verification overview/iu }),
    ).toBeVisible();
  });

  /**
   * The panel must survive the transition it causes. An application that has
   * just been verified is in VERIFICATION, and hiding the overview at exactly
   * the moment it has something to say would be the worst possible time.
   */
  it('keeps the overview visible once the application is in verification', async () => {
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    mocks.verification.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /verification overview/iu }),
    ).toBeVisible();
    // The label appears both on the status badge and above the progress bar.
    expect(screen.getAllByText('Verification in progress').length).toBeGreaterThan(0);
  });

  it('does not show the overview on a draft, which has nothing to check', async () => {
    mocks.application.mockResolvedValue(application('DRAFT'));
    renderPage();

    await screen.findByRole('heading', { name: /apply for national merit scholarship/iu });
    expect(
      screen.queryByRole('heading', { name: /verification overview/iu }),
    ).not.toBeInTheDocument();
  });

  it('shows the lifecycle status as a citizen-facing label, not a database value', async () => {
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    mocks.verification.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    renderPage();

    await screen.findByRole('heading', { name: /verification overview/iu });
    expect(screen.queryByText('VERIFICATION')).not.toBeInTheDocument();
    expect(screen.queryByText(/UNDER_VERIFICATION/u)).not.toBeInTheDocument();
  });

  it('re-reads the application after a run, so the new status is shown', async () => {
    mocks.start.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    renderPage();

    await screen.findByRole('button', { name: /start verification/iu });
    // The application is re-read after the run because its status has moved.
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    await userEvent.click(screen.getByRole('button', { name: /start verification/iu }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(APPLICATION_ID));
    await waitFor(() => expect(mocks.application).toHaveBeenCalledTimes(2));
  });

  /**
   * The two panels must keep saying different things. "Retrieved" is Phase 8
   * having the document; "Verified" is Phase 10 having checked it.
   */
  it('keeps retrieval and verification as separate statements', async () => {
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    mocks.verification.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    mocks.retrievals.mockResolvedValue({
      applicationId: APPLICATION_ID,
      applicationNumber: 'STX-2026-000013',
      serviceName: 'National Merit Scholarship',
      items: [
        {
          requirementId: REQUIREMENT_ID,
          requirementCode: 'IDENTITY',
          information: 'Identity Verification',
          source: 'Identity Registry (Mock)',
          isSimulated: true,
          availability: 'COMPLETED' as const,
          status: 'SUCCESS' as const,
          documentType: 'IDENTITY_RECORD',
          providerReference: 'SYNTH-ID-000001',
          issuer: 'Identity Registry (Simulated)',
          retrievedAt: NOW,
          values: [],
          failureReason: null,
        },
      ],
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /documents from government systems/iu }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: /verification overview/iu }),
    ).toBeVisible();
    // Both words are present, on their own panels, meaning their own things.
    // Matched on the badge spans specifically: "Retrieved" is also the label of
    // the retrieval timestamp, and matching loosely would prove nothing.
    const badgeText = (label: string) =>
      screen.getAllByText(
        (_, element) => element?.textContent?.trim() === label && element.tagName === 'SPAN',
      );
    expect(badgeText('Retrieved').length).toBeGreaterThan(0);
    expect(badgeText('Verified').length).toBeGreaterThan(0);
  });

  it('never announces an application decision anywhere on the page', async () => {
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    mocks.verification.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    renderPage();

    await screen.findByRole('heading', { name: /verification overview/iu });
    for (const forbidden of [
      /application approved/iu,
      /scholarship approved/iu,
      /you are eligible/iu,
      /final approval/iu,
      /rejected/iu,
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it('keeps a single top-level heading on the page', async () => {
    mocks.application.mockResolvedValue(application('VERIFICATION'));
    mocks.verification.mockResolvedValue(verificationPayload('ALREADY_STARTED', 'VERIFIED'));
    renderPage();

    await screen.findByRole('heading', { name: /verification overview/iu });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
