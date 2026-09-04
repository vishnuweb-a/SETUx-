import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

const applicationService = await import('@/features/applications/services/application-service');
const consentService = await import('@/features/consents/services/consent-service');
const retrievalService = await import('@/features/retrievals/services/retrieval-service');
const { ApplicationDetailPage } = await import(
  '@/features/applications/pages/application-detail-page'
);

const mocks = {
  application: vi.mocked(applicationService.fetchApplication),
  consents: vi.mocked(consentService.fetchApplicationConsents),
  retrievals: vi.mocked(retrievalService.fetchApplicationRetrievals),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const REQUIREMENT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-09-04T08:00:00.000Z';

const application = (status: 'DRAFT' | 'SUBMITTED') => ({
  id: APPLICATION_ID,
  applicationNumber: 'STX-2026-000001',
  service: { id: 's', code: 'SCHOLARSHIP_MERIT', name: 'National Merit Scholarship', department: 'Education' },
  status,
  createdAt: NOW,
  updatedAt: NOW,
  submittedAt: status === 'SUBMITTED' ? NOW : null,
  applicant: {
    fullName: 'Demo Citizen',
    governmentId: 'SYNTH-0001',
    mobileNumber: '9000000000',
    dateOfBirth: '2004-01-01',
  },
  requirements: [
    {
      id: REQUIREMENT_ID,
      code: 'BANK_DETAILS',
      name: 'Bank Account Proof',
      description: 'Passbook.',
      type: 'DOCUMENT' as const,
      source: 'DigiLocker (Mock)',
      required: false,
      displayOrder: 4,
    },
  ],
  fields: {},
});

const retrievalPayload = (availability: 'AVAILABLE' | 'CONSENT_REQUIRED') => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000001',
  serviceName: 'National Merit Scholarship',
  items: [
    {
      requirementId: REQUIREMENT_ID,
      requirementCode: 'BANK_DETAILS',
      information: 'Bank Account Proof',
      source: 'DigiLocker (Mock)',
      isSimulated: true,
      availability,
      status: null,
      documentType: null,
      providerReference: null,
      issuer: null,
      retrievedAt: null,
      values: [],
      failureReason: null,
    },
  ],
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
      applicationNumber: 'STX-2026-000001',
      serviceName: 'National Merit Scholarship',
      recipient: 'Education',
      applicationStatus: 'SUBMITTED',
    },
    consents: [],
    isDecisionRequired: false,
  });
  mocks.retrievals.mockResolvedValue(retrievalPayload('AVAILABLE'));
});

describe('retrieval on the application page', () => {
  it('shows the retrieval panel on a submitted application', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /documents from government systems/iu }),
    ).toBeVisible();
  });

  it('offers the fetch action once consent is granted', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /fetch from DigiLocker/iu })).toBeVisible();
  });

  it('does not show the panel on a draft, which cannot be retrieved against', async () => {
    mocks.application.mockResolvedValue(application('DRAFT'));
    renderPage();
    await screen.findByRole('heading', { name: /apply for/iu });
    expect(
      screen.queryByRole('heading', { name: /documents from government systems/iu }),
    ).not.toBeInTheDocument();
    expect(mocks.retrievals).not.toHaveBeenCalled();
  });

  it('keeps the page to a single h1', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /documents from government systems/iu });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('points an undecided consent back to the consent page', async () => {
    mocks.retrievals.mockResolvedValue(retrievalPayload('CONSENT_REQUIRED'));
    renderPage();
    expect(await screen.findByRole('link', { name: /review consent/iu })).toBeVisible();
  });
});
