import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/applications/services/application-service', () => ({
  createApplication: vi.fn(),
  fetchApplications: vi.fn(),
  fetchApplication: vi.fn(),
  saveApplicationDraft: vi.fn(),
  submitApplication: vi.fn(),
}));

const service = await import('@/features/applications/services/application-service');
const { ApplicationDetailPage } = await import('@/features/applications/pages/application-detail-page');
const { ApplicationListPage } = await import('@/features/applications/pages/application-list-page');
const mocks = {
  list: vi.mocked(service.fetchApplications),
  detail: vi.mocked(service.fetchApplication),
  save: vi.mocked(service.saveApplicationDraft),
  submit: vi.mocked(service.submitApplication),
};

const APPLICATION = {
  id: '22222222-2222-4222-8222-222222222222',
  applicationNumber: 'STX-2026-000001',
  service: { id: '11111111-1111-4111-8111-111111111111', code: 'SCHOLARSHIP_SPORTS', name: 'Sports Excellence Scholarship', department: 'Social Welfare' },
  status: 'DRAFT' as const,
  createdAt: '2026-09-04T08:00:00.000Z',
  updatedAt: '2026-09-04T08:00:00.000Z',
  submittedAt: null,
  applicant: { fullName: 'Synthetic Citizen', governmentId: 'SYN-10001', mobileNumber: '+919000000001', dateOfBirth: '2004-01-01' },
  requirements: [{ id: 'requirement-1', code: 'ACHIEVEMENT_DECL', name: 'Achievement Declaration', description: 'Describe your achievement.', type: 'DECLARATION' as const, source: null, required: true, displayOrder: 1 }],
  fields: {},
};

/**
 * A data router, matching `createBrowserRouter` in the app itself: the detail
 * page uses `useBlocker` to guard unsaved changes, and that hook exists only on
 * a data router.
 */
const wrapper = (children: React.ReactNode, path = '/citizen/applications/:applicationId') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path, element: children }], {
    initialEntries: [`/citizen/applications/${APPLICATION.id}`],
  });
  return <QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue(APPLICATION);
  mocks.list.mockResolvedValue({ items: [APPLICATION], page: 1, limit: 20, total: 1, totalPages: 1 });
  mocks.save.mockResolvedValue({ ...APPLICATION, fields: { ACHIEVEMENT_DECL: 'Synthetic achievement.' } });
  mocks.submit.mockResolvedValue({ ...APPLICATION, status: 'SUBMITTED', submittedAt: '2026-09-04T09:00:00.000Z' });
});

describe('application form', () => {
  it('renders authoritative profile data as read-only fields', async () => {
    render(wrapper(<ApplicationDetailPage />));
    expect(await screen.findByDisplayValue('Synthetic Citizen')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('SYN-10001')).toHaveAttribute('readonly');
  });

  it('saves configured declaration data and then submits once', async () => {
    const user = userEvent.setup();
    render(wrapper(<ApplicationDetailPage />));
    await user.type(await screen.findByRole('textbox', { name: /achievement declaration/i }), 'Synthetic achievement.');
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    expect(mocks.save).toHaveBeenCalledWith(APPLICATION.id, { ACHIEVEMENT_DECL: 'Synthetic achievement.' });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it('warns before an in-app navigation abandons unsaved declaration edits', async () => {
    // `beforeunload` covers a reload, but a SPA route change fires no such
    // event: without a router-level block, following a link silently discarded
    // the edit.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(
      wrapper(
        <div>
          <Link to="/citizen/applications">Leave this page</Link>
          <ApplicationDetailPage />
        </div>,
      ),
    );

    await user.type(
      await screen.findByRole('textbox', { name: /achievement declaration/i }),
      'Synthetic achievement.',
    );
    await user.click(screen.getByRole('link', { name: /leave this page/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    // Declining keeps the citizen on the form with the edit intact.
    expect(screen.getByRole('textbox', { name: /achievement declaration/i })).toHaveValue(
      'Synthetic achievement.',
    );

    confirmSpy.mockRestore();
  });

  it('marks a required declaration as required for assistive technology', async () => {
    render(wrapper(<ApplicationDetailPage />));
    expect(await screen.findByRole('textbox', { name: /achievement declaration/i })).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('renders submitted applications as read-only', async () => {
    mocks.detail.mockResolvedValue({ ...APPLICATION, status: 'SUBMITTED', submittedAt: '2026-09-04T09:00:00.000Z' });
    render(wrapper(<ApplicationDetailPage />));
    expect(await screen.findByText(/now read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit application/i })).not.toBeInTheDocument();
  });
});

describe('application list', () => {
  it('lists persisted applications and links to their detail', async () => {
    render(wrapper(<ApplicationListPage />, '/citizen/applications/:applicationId'));
    expect(await screen.findByText('STX-2026-000001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute('href', `/citizen/applications/${APPLICATION.id}`);
  });

  it('offers the catalogue when there are no applications', async () => {
    mocks.list.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
    render(wrapper(<ApplicationListPage />, '/citizen/applications/:applicationId'));
    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse scholarships/i })).toHaveAttribute('href', '/citizen/services');
  });
});
