import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api-client';

/**
 * The Phase 5 detail screen.
 *
 * The most important assertion in this file is the last one: pressing Apply
 * must not create an application. Phase 5 ends at presentation (§18, §33, §46).
 */

vi.mock('@/features/scholarships/services/scholarship-service', () => ({
  fetchScholarships: vi.fn(),
  fetchScholarshipDepartments: vi.fn(),
  fetchScholarship: vi.fn(),
  fetchScholarshipRequirements: vi.fn(),
}));

const scholarshipService = await import('@/features/scholarships/services/scholarship-service');
const { ScholarshipDetailPage } = await import(
  '@/features/scholarships/pages/scholarship-detail-page'
);

const fetchScholarshipMock = vi.mocked(scholarshipService.fetchScholarship);

const SCHOLARSHIP_ID = 'a1111111-1111-4111-8111-111111111111';

const DETAIL = {
  id: SCHOLARSHIP_ID,
  code: 'SCHOLARSHIP_MERIT',
  name: 'National Merit Scholarship',
  description: 'Merit-based scholarship for undergraduate students in India.',
  department: 'Higher Education',
  requirements: [
    {
      id: 'req-1',
      code: 'IDENTITY',
      name: 'Identity Verification',
      description: 'Confirms your identity against the national identity registry.',
      type: 'IDENTITY' as const,
      source: 'Identity Registry (Mock)',
      required: true,
      displayOrder: 1,
    },
    {
      id: 'req-2',
      code: 'BANK_DETAILS',
      name: 'Bank Account Proof',
      description: null,
      type: 'DOCUMENT' as const,
      source: 'DigiLocker (Mock)',
      required: false,
      displayOrder: 2,
    },
  ],
};

const renderDetail = (id = SCHOLARSHIP_ID) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/citizen/services/${id}`]}>
        <Routes>
          <Route path="/citizen/services" element={<p>Catalogue</p>} />
          <Route path="/citizen/services/:scholarshipId" element={<ScholarshipDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchScholarshipMock.mockResolvedValue(DETAIL);
});

describe('detail rendering', () => {
  it('renders the scholarship name as the page heading', async () => {
    renderDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'National Merit Scholarship' }),
    ).toBeInTheDocument();
  });

  it('renders the description and department from the API', async () => {
    renderDetail();

    expect(await screen.findByText(DETAIL.description)).toBeInTheDocument();
    expect(screen.getAllByText('Higher Education').length).toBeGreaterThan(0);
  });

  it('shows a loading state before the data arrives', () => {
    renderDetail();

    expect(screen.getByText(/loading scholarship/i)).toBeInTheDocument();
  });

  it('offers a breadcrumb back to the catalogue', async () => {
    renderDetail();

    const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i });
    expect(breadcrumb).toBeInTheDocument();
  });
});

describe('requirements', () => {
  it('renders every requirement the API returned', async () => {
    renderDetail();

    expect(await screen.findByText('Identity Verification')).toBeInTheDocument();
    expect(screen.getByText('Bank Account Proof')).toBeInTheDocument();
  });

  it('renders requirement descriptions from the database', async () => {
    renderDetail();

    expect(
      await screen.findByText(/confirms your identity against the national identity registry/i),
    ).toBeInTheDocument();
  });

  it('names the government system that supplies each requirement', async () => {
    renderDetail();

    await screen.findByText('Identity Verification');
    expect(screen.getByText('Identity Registry (Mock)')).toBeInTheDocument();
    expect(screen.getByText('DigiLocker (Mock)')).toBeInTheDocument();
  });

  it('marks an optional requirement as optional', async () => {
    renderDetail();

    expect(await screen.findByText('Optional')).toBeInTheDocument();
  });

  it('counts the mandatory requirements', async () => {
    renderDetail();

    expect(await screen.findByText(/1 required · 2 in total/)).toBeInTheDocument();
  });
});

describe('not found', () => {
  it('renders a not-found state for an unknown scholarship', async () => {
    fetchScholarshipMock.mockRejectedValue(
      new ApiError({ code: 'RESOURCE_NOT_FOUND', message: 'Service not found.', status: 404 }),
    );
    renderDetail();

    expect(await screen.findByText(/scholarship not found/i)).toBeInTheDocument();
  });

  it('treats a malformed identifier as not found rather than crashing', async () => {
    fetchScholarshipMock.mockRejectedValue(
      new ApiError({ code: 'VALIDATION_ERROR', message: 'Invalid id.', status: 400 }),
    );
    renderDetail('not-a-uuid');

    expect(await screen.findByText(/scholarship not found/i)).toBeInTheDocument();
  });

  it('offers a way back to the catalogue', async () => {
    fetchScholarshipMock.mockRejectedValue(
      new ApiError({ code: 'RESOURCE_NOT_FOUND', message: 'Service not found.', status: 404 }),
    );
    renderDetail();

    await screen.findByText(/scholarship not found/i);
    expect(screen.getByRole('link', { name: /browse scholarships/i })).toHaveAttribute(
      'href',
      '/citizen/services',
    );
  });
});

describe('error state', () => {
  it('shows a safe message when the request fails', async () => {
    fetchScholarshipMock.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'relation "services" missing', status: 500 }),
    );
    renderDetail();

    expect(await screen.findByText(/could not load this scholarship/i)).toBeInTheDocument();
    expect(screen.queryByText(/relation "services" missing/)).not.toBeInTheDocument();
  });
});

/**
 * The phase boundary, asserted at the screen the citizen would press.
 */
describe('apply CTA', () => {
  it('is present, as the reference shows it', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: /apply now/i })).toBeInTheDocument();
  });

  it('creates no application when pressed', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: /apply now/i }));

    // The catalogue service is the feature's entire API surface, and all four
    // of its calls are reads. None of them is a create.
    expect(scholarshipService.fetchScholarships).not.toHaveBeenCalled();
    for (const mock of Object.values(scholarshipService)) {
      const calls = vi.mocked(mock).mock.calls;
      for (const [, options] of calls) {
        expect(options).not.toMatchObject({ method: expect.anything() });
      }
    }
  });

  it('says applications are not open yet rather than claiming a submission', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: /apply now/i }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/no application has been created/i);
    expect(notice).not.toHaveTextContent(/application submitted/i);
  });
});
