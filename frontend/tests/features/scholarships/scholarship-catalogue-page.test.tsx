import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api-client';

/**
 * The Phase 5 catalogue screen.
 *
 * The API layer is stubbed; everything above it — the URL-driven filter state,
 * the debounce, the query hooks, the four render states and the grid — is the
 * code under test.
 */

vi.mock('@/features/scholarships/services/scholarship-service', () => ({
  fetchScholarships: vi.fn(),
  fetchScholarshipDepartments: vi.fn(),
  fetchScholarship: vi.fn(),
  fetchScholarshipRequirements: vi.fn(),
}));

const { fetchScholarships, fetchScholarshipDepartments } = await import(
  '@/features/scholarships/services/scholarship-service'
);
const { ScholarshipCataloguePage } = await import(
  '@/features/scholarships/pages/scholarship-catalogue-page'
);

const fetchScholarshipsMock = vi.mocked(fetchScholarships);
const fetchDepartmentsMock = vi.mocked(fetchScholarshipDepartments);

const SCHOLARSHIPS = [
  {
    id: 'a1111111-1111-4111-8111-111111111111',
    code: 'SCHOLARSHIP_MERIT',
    name: 'National Merit Scholarship',
    description: 'Merit-based scholarship for undergraduate students.',
    department: 'Higher Education',
  },
  {
    id: 'b2222222-2222-4222-8222-222222222222',
    code: 'SCHOLARSHIP_TECH',
    name: 'Technical Education Grant',
    description: 'Tuition support for diploma and engineering students.',
    department: 'Technical Education',
  },
];

const listPayload = (items = SCHOLARSHIPS, overrides = {}) => ({
  items,
  page: 1,
  limit: 12,
  total: items.length,
  totalPages: 1,
  ...overrides,
});

/** A fresh client per test, with retries off so error states render at once. */
const renderCatalogue = (initialPath = '/citizen/services') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/citizen/services" element={<ScholarshipCataloguePage />} />
          <Route path="/citizen/services/:id" element={<p>Detail screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchScholarshipsMock.mockResolvedValue(listPayload());
  fetchDepartmentsMock.mockResolvedValue({
    departments: ['Higher Education', 'Technical Education'],
  });
});

describe('catalogue rendering', () => {
  it('renders a card for each scholarship the API returns', async () => {
    renderCatalogue();

    expect(await screen.findByText('National Merit Scholarship')).toBeInTheDocument();
    expect(screen.getByText('Technical Education Grant')).toBeInTheDocument();
  });

  it('shows each scholarship as a link to its detail route', async () => {
    renderCatalogue();

    const link = await screen.findByRole('link', { name: /National Merit Scholarship/ });
    expect(link).toHaveAttribute(
      'href',
      '/citizen/services/a1111111-1111-4111-8111-111111111111',
    );
  });

  it('renders the department each scholarship belongs to', async () => {
    renderCatalogue();

    await screen.findByText('National Merit Scholarship');
    expect(screen.getAllByText('Higher Education').length).toBeGreaterThan(0);
  });

  it('announces a loading state before the data arrives', () => {
    renderCatalogue();

    expect(screen.getByText(/loading scholarships/i)).toBeInTheDocument();
  });
});

describe('search', () => {
  it('queries the API with the typed term', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByText('National Merit Scholarship');

    await user.type(screen.getByRole('searchbox', { name: /search scholarships/i }), 'merit');

    await waitFor(() =>
      expect(fetchScholarshipsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'merit' }),
        expect.anything(),
      ),
    );
  });

  it('debounces rather than querying on every keystroke', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByText('National Merit Scholarship');

    const callsBefore = fetchScholarshipsMock.mock.calls.length;
    await user.type(screen.getByRole('searchbox', { name: /search scholarships/i }), 'merit');

    await waitFor(() =>
      expect(fetchScholarshipsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'merit' }),
        expect.anything(),
      ),
    );

    // Five characters typed; far fewer than five additional requests issued.
    expect(fetchScholarshipsMock.mock.calls.length - callsBefore).toBeLessThan(5);
  });

  it('reads an initial search term from the URL', async () => {
    renderCatalogue('/citizen/services?search=merit');

    await waitFor(() =>
      expect(fetchScholarshipsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'merit' }),
        expect.anything(),
      ),
    );
    expect(screen.getByRole('searchbox', { name: /search scholarships/i })).toHaveValue('merit');
  });

  it('does not send a whitespace-only term as a filter', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByText('National Merit Scholarship');

    await user.type(screen.getByRole('searchbox', { name: /search scholarships/i }), '   ');

    await waitFor(() => {
      const lastCall = fetchScholarshipsMock.mock.calls.at(-1)?.[0];
      expect(lastCall).not.toHaveProperty('search');
    });
  });
});

describe('department filter', () => {
  it('renders a chip per department', async () => {
    renderCatalogue();

    expect(
      await screen.findByRole('button', { name: 'Technical Education' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All departments' })).toBeInTheDocument();
  });

  it('queries the API when a department is chosen', async () => {
    const user = userEvent.setup();
    renderCatalogue();

    await user.click(await screen.findByRole('button', { name: 'Technical Education' }));

    await waitFor(() =>
      expect(fetchScholarshipsMock).toHaveBeenCalledWith(
        expect.objectContaining({ department: 'Technical Education' }),
        expect.anything(),
      ),
    );
  });

  it('marks the chosen department as pressed', async () => {
    const user = userEvent.setup();
    renderCatalogue();

    const chip = await screen.findByRole('button', { name: 'Technical Education' });
    await user.click(chip);

    await waitFor(() => expect(chip).toHaveAttribute('aria-pressed', 'true'));
  });

  it('clears both filters', async () => {
    const user = userEvent.setup();
    renderCatalogue('/citizen/services?search=merit&department=Higher%20Education');
    await screen.findByText('National Merit Scholarship');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const lastCall = fetchScholarshipsMock.mock.calls.at(-1)?.[0];
      expect(lastCall).not.toHaveProperty('search');
      expect(lastCall).not.toHaveProperty('department');
    });
  });
});

describe('empty states', () => {
  it('distinguishes "no results for your filters" from an empty catalogue', async () => {
    fetchScholarshipsMock.mockResolvedValue(listPayload([], { total: 0 }));
    renderCatalogue('/citizen/services?search=nothingmatches');

    expect(await screen.findByText(/no scholarships match your filters/i)).toBeInTheDocument();
  });

  it('reports an empty catalogue without blaming the filters', async () => {
    fetchScholarshipsMock.mockResolvedValue(listPayload([], { total: 0 }));
    renderCatalogue();

    expect(await screen.findByText(/no scholarships are available yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/match your filters/i)).not.toBeInTheDocument();
  });
});

describe('error state', () => {
  it('shows a safe message and a retry when the request fails', async () => {
    fetchScholarshipsMock.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'relation "services" missing', status: 500 }),
    );
    renderCatalogue();

    expect(await screen.findByText(/could not load scholarships/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('never renders the server message verbatim', async () => {
    fetchScholarshipsMock.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'relation "services" missing', status: 500 }),
    );
    renderCatalogue();

    await screen.findByText(/could not load scholarships/i);
    expect(screen.queryByText(/relation "services" missing/)).not.toBeInTheDocument();
  });

  it('retries when asked', async () => {
    const user = userEvent.setup();
    fetchScholarshipsMock.mockRejectedValueOnce(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }),
    );
    renderCatalogue();

    await user.click(await screen.findByRole('button', { name: /try again/i }));

    expect(await screen.findByText('National Merit Scholarship')).toBeInTheDocument();
  });
});

describe('pagination', () => {
  it('is not rendered when everything fits on one page', async () => {
    renderCatalogue();

    await screen.findByText('National Merit Scholarship');
    expect(screen.queryByRole('navigation', { name: /scholarship pages/i })).not.toBeInTheDocument();
  });

  it('requests the next page', async () => {
    const user = userEvent.setup();
    fetchScholarshipsMock.mockResolvedValue(listPayload(SCHOLARSHIPS, { total: 20, totalPages: 2 }));
    renderCatalogue();

    const pager = await screen.findByRole('navigation', { name: /scholarship pages/i });
    await user.click(within(pager).getByRole('button', { name: /next/i }));

    await waitFor(() =>
      expect(fetchScholarshipsMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    );
  });

  it('disables Previous on the first page', async () => {
    fetchScholarshipsMock.mockResolvedValue(listPayload(SCHOLARSHIPS, { total: 20, totalPages: 2 }));
    renderCatalogue();

    const pager = await screen.findByRole('navigation', { name: /scholarship pages/i });
    expect(within(pager).getByRole('button', { name: /previous/i })).toBeDisabled();
  });
});

describe('phase boundary', () => {
  it('never issues a write while browsing the catalogue', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByText('National Merit Scholarship');

    await user.type(screen.getByRole('searchbox', { name: /search scholarships/i }), 'merit');
    await user.click(screen.getByRole('button', { name: 'Technical Education' }));

    // The catalogue's whole API surface is reads; no mutation exists to call.
    for (const [, options] of fetchScholarshipsMock.mock.calls) {
      expect(options).not.toMatchObject({ method: expect.stringMatching(/POST|PUT|PATCH|DELETE/) });
    }
  });
});
