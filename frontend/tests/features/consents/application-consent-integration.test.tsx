import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/applications/services/application-service', () => ({
  createApplication: vi.fn(),
  fetchApplications: vi.fn(),
  fetchApplication: vi.fn(),
  saveApplicationDraft: vi.fn(),
  submitApplication: vi.fn(),
}));
vi.mock('@/features/consents/services/consent-service', () => ({
  fetchApplicationConsents: vi.fn(),
  grantConsent: vi.fn(),
  denyConsent: vi.fn(),
}));

const applicationService = await import('@/features/applications/services/application-service');
const consentService = await import('@/features/consents/services/consent-service');
const { ApplicationDetailPage } = await import('@/features/applications/pages/application-detail-page');

const fetchApplication = vi.mocked(applicationService.fetchApplication);
const fetchConsents = vi.mocked(consentService.fetchApplicationConsents);

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const SUBMITTED = {
  id: APPLICATION_ID,
  applicationNumber: 'STX-2026-000001',
  service: { id: '11111111-1111-4111-8111-111111111111', code: 'SCHOLARSHIP_MERIT', name: 'National Merit Scholarship', department: 'Education' },
  status: 'SUBMITTED' as const,
  createdAt: '2026-09-04T08:00:00.000Z',
  updatedAt: '2026-09-04T08:00:00.000Z',
  submittedAt: '2026-09-04T08:30:00.000Z',
  applicant: { fullName: 'Synthetic Citizen', governmentId: 'SYN-10001', mobileNumber: '+919000000001', dateOfBirth: '2004-01-01' },
  requirements: [],
  fields: {},
};

const consentPayload = (status: 'PENDING' | 'GRANTED') => ({
  application: {
    applicationId: APPLICATION_ID,
    applicationNumber: 'STX-2026-000001',
    serviceName: 'National Merit Scholarship',
    recipient: 'Education',
    applicationStatus: 'SUBMITTED',
  },
  consents: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      applicationId: APPLICATION_ID,
      information: 'Income Certificate',
      description: null,
      source: 'Income & Revenue Department (Mock)',
      purpose: 'Verify Income Certificate for your National Merit Scholarship application',
      status,
      decidedAt: status === 'GRANTED' ? '2026-09-04T09:00:00.000Z' : null,
    },
  ],
  isDecisionRequired: status === 'PENDING',
});

const renderDetail = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/citizen/applications/:applicationId', element: <ApplicationDetailPage /> }],
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
  fetchApplication.mockResolvedValue(SUBMITTED);
  fetchConsents.mockResolvedValue(consentPayload('PENDING'));
});

describe('consent status on a submitted application', () => {
  it('makes the outstanding consent the obvious next action', async () => {
    renderDetail();
    expect(await screen.findByText(/needs your consent/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review consent request/i })).toHaveAttribute(
      'href',
      `/citizen/applications/${APPLICATION_ID}/consent`,
    );
  });

  it('stops prompting once every consent is decided', async () => {
    fetchConsents.mockResolvedValue(consentPayload('GRANTED'));
    renderDetail();
    expect(await screen.findByText(/responded to every consent request/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /review consent request/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view consent decisions/i })).toBeInTheDocument();
  });

  it('says nothing about consent for a service that needs none', async () => {
    fetchConsents.mockResolvedValue({ ...consentPayload('PENDING'), consents: [], isDecisionRequired: false });
    renderDetail();
    expect(await screen.findByText(/submitted successfully and is now read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /consent/i })).not.toBeInTheDocument();
  });

  it('never claims consent is outstanding while the check is still loading', async () => {
    fetchConsents.mockImplementation(() => new Promise(() => {}));
    renderDetail();
    expect(await screen.findByText(/submitted successfully and is now read-only/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs your consent/i)).not.toBeInTheDocument();
  });

  it('leaves a draft application alone', async () => {
    fetchApplication.mockResolvedValue({ ...SUBMITTED, status: 'DRAFT', submittedAt: null });
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/needs your consent/i)).not.toBeInTheDocument();
    expect(fetchConsents).not.toHaveBeenCalled();
  });
});
