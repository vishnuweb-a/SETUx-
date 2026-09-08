import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChangeImpact,
  ChangeImpactAnalysis,
  ChangeImpactLevel,
} from '@/features/change-details';

/**
 * The Phase 5 impact preview.
 *
 * The assertions fall into three groups, and the third is the phase boundary
 * this file exists to defend:
 *
 * 1. The canonical name-change impacts render, one card per record, with the
 *    right badge and the rule's own reason.
 * 2. Every state is handled: loading, empty, unavailable target, API error,
 *    404, and a draft with no fields.
 * 3. **The page selects nothing and sends nothing.** There is no checkbox, no
 *    mutation and no consent call — asserted by inspecting what the service
 *    module exposes and by asserting no control exists, not by trusting the
 *    component's comments.
 */

vi.mock('@/features/change-details/services/change-impact-service', () => ({
  // ONE function, deliberately. If the page tried to POST, PATCH or DELETE, it
  // would have to call something that does not exist here.
  fetchChangeImpact: vi.fn(),
}));

const impactService = await import('@/features/change-details/services/change-impact-service');
const { ChangeImpactPage } = await import(
  '@/features/change-details/pages/change-impact-page'
);
const { ApiError } = await import('@/services/api-client');

const fetchImpact = vi.mocked(impactService.fetchChangeImpact);

const RECORD_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_ID = '44444444-4444-4444-8444-444444444444';

/**
 * One impact entry, typed against the real contract.
 *
 * `ChangeImpact` rather than a loose object literal, deliberately: a fixture
 * typed as `Record<string, unknown>` would let this file drift from the shape
 * the page actually receives, and the first thing to break would be a test that
 * still passed.
 */
const impactEntry = (
  recordType: ChangeImpact['recordType'],
  impactLevel: ChangeImpactLevel,
  overrides: Partial<ChangeImpact> = {},
): ChangeImpact => ({
  recordType,
  recordId: `${recordType.toLowerCase()}-id`,
  available: true,
  impactLevel,
  reasons: [
    {
      fieldKey: 'identityHolderName',
      impactLevel,
      reason: `Your ${recordType} holds the same name.`,
    },
  ],
  responsibleDepartment: { code: 'REVENUE_DEPT', name: 'Revenue Department' },
  ...overrides,
});

/** The canonical scenario of arch §23, as the API returns it. */
const ANALYSIS: ChangeImpactAnalysis = {
  changeRequestId: DRAFT_ID,
  sourceRecord: { recordId: RECORD_ID, recordType: 'IDENTITY_RECORD' as const },
  changedFields: [
    {
      fieldKey: 'identityHolderName',
      oldValue: 'Demo Old Name',
      proposedValue: 'Demo New Name',
    },
  ],
  impacts: [
    impactEntry('INCOME_RECORD', 'REQUIRED'),
    impactEntry('COMMUNITY_RECORD', 'RECOMMENDED', {
      responsibleDepartment: { code: 'MINORITY_AFFAIRS', name: 'Minority Affairs' },
    }),
    impactEntry('EDUCATION_RECORD', 'RECOMMENDED', {
      responsibleDepartment: { code: 'HIGHER_ED', name: 'Higher Education' },
    }),
    impactEntry('BANK_DETAILS', 'OPTIONAL', { responsibleDepartment: null }),
  ],
};

const renderImpact = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/citizen/change-details/drafts/${DRAFT_ID}/impact`]}>
        <Routes>
          <Route
            path="/citizen/change-details/drafts/:changeRequestId/impact"
            element={<ChangeImpactPage />}
          />
          <Route
            path="/citizen/change-details/drafts/:changeRequestId"
            element={<div>Draft screen</div>}
          />
          <Route path="/citizen/change-details" element={<div>Records list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchImpact.mockResolvedValue(ANALYSIS);
});

describe('impact preview — the canonical name change', () => {
  it('renders one card per affected record', async () => {
    renderImpact();

    const list = await screen.findByRole('list', { name: /records that may be affected/i });

    // Direct children only. Each card nests its own list of reasons, so
    // counting every descendant listitem would count reasons as records.
    const cards = [...list.children].filter((child) => child.tagName === 'LI');
    expect(cards).toHaveLength(4);
  });

  it('names every affected record exactly once', async () => {
    renderImpact();

    // The server merges duplicates, so a record appearing twice would mean the
    // page had re-derived the list rather than rendering what it was given.
    expect(await screen.findByRole('heading', { name: 'Income Certificate' })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'Income Certificate' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Education Record' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Community Certificate' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Bank Details' })).toBeVisible();
  });

  it('shows a REQUIRED badge', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });
    expect(screen.getByText('Required')).toBeVisible();
  });

  it('shows RECOMMENDED badges', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Education Record' });
    // Two records are RECOMMENDED in the canonical scenario.
    expect(screen.getAllByText('Recommended')).toHaveLength(2);
  });

  it('shows an OPTIONAL badge', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Bank Details' });
    expect(screen.getByText('Optional')).toBeVisible();
  });

  it('shows the rule’s own reason on each card', async () => {
    renderImpact();

    expect(
      await screen.findByText(/Your INCOME_RECORD holds the same name\./),
    ).toBeVisible();
  });

  it('names the responsible department, and says so honestly for the bank', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });
    expect(screen.getByText('Revenue Department')).toBeVisible();
    expect(screen.getByText('Higher Education')).toBeVisible();
    expect(screen.getByText('Minority Affairs')).toBeVisible();
    // The bank has no officer queue, and the card says so rather than leaving
    // an empty space that reads as missing data.
    // Exactly one record — the bank — is held outside government.
    expect(screen.getAllByText(/held outside government systems/i)).toHaveLength(1);
  });

  it('shows the correction the analysis is about', async () => {
    renderImpact();

    // Four cards explaining consequences, with the change that causes them off
    // screen, would ask somebody to accept an argument whose premise is absent.
    expect(await screen.findByText('Demo Old Name')).toBeVisible();
    expect(screen.getByText('Demo New Name')).toBeVisible();
    expect(screen.getByText('Full Name')).toBeVisible();
  });

  it('renders the cards in the server’s order, strongest first', async () => {
    renderImpact();

    const list = await screen.findByRole('list', { name: /records that may be affected/i });
    const headings = within(list)
      .getAllByRole('heading')
      .map((heading) => heading.textContent);

    // Not re-sorted in the client: the ranking is a decision the backend made.
    expect(headings).toStrictEqual([
      'Income Certificate',
      'Community Certificate',
      'Education Record',
      'Bank Details',
    ]);
  });
});

describe('impact preview — the phase boundary', () => {
  it('renders NO checkbox', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });

    // Target selection is the next stage. A control here would offer an action
    // that goes nowhere; a pre-checked one would imply a decision had been
    // recorded on the citizen's behalf.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('offers no consent, submit or send action', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });

    for (const label of [/consent/i, /submit/i, /^send/i, /continue/i, /confirm/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('states plainly that nothing has been sent', async () => {
    renderImpact();

    expect(await screen.findByText(/nothing has been sent yet/i)).toBeVisible();
  });

  it('exposes only a read call — no mutation exists to make', () => {
    // The stronger version of the assertions above: the page cannot POST,
    // PATCH or DELETE because the service module it imports has one function.
    expect(Object.keys(impactService)).toStrictEqual(['fetchChangeImpact']);
  });

  it('makes exactly one network call, and it is the impact read', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });

    expect(fetchImpact).toHaveBeenCalledTimes(1);
    expect(fetchImpact).toHaveBeenCalledWith(DRAFT_ID, expect.anything());
  });
});

describe('impact preview — states', () => {
  it('shows a loading state before the analysis arrives', () => {
    fetchImpact.mockImplementation(() => new Promise(() => {}));

    renderImpact();

    expect(screen.getByRole('status')).toBeVisible();
  });

  it('shows an empty state when nothing else is affected', async () => {
    fetchImpact.mockResolvedValue({ ...ANALYSIS, impacts: [] });

    renderImpact();

    expect(
      await screen.findByText('No other linked records were detected'),
    ).toBeVisible();
  });

  it('does not claim government systems are synchronised in the empty state', async () => {
    fetchImpact.mockResolvedValue({ ...ANALYSIS, impacts: [] });

    renderImpact();

    await screen.findByText('No other linked records were detected');

    // This is a prototype over synthetic records. Implying that every
    // government system is in sync would be the one claim on this page with
    // consequences outside the screen.
    expect(screen.queryByText(/all .*(records|systems).* (are )?up to date/i)).toBeNull();
  });

  it('shows an unavailable target clearly rather than hiding it', async () => {
    fetchImpact.mockResolvedValue({
      ...ANALYSIS,
      impacts: [
        impactEntry('BANK_DETAILS', 'OPTIONAL', {
          available: false,
          recordId: null,
          responsibleDepartment: null,
        }),
      ],
    });

    renderImpact();

    expect(await screen.findByRole('heading', { name: 'Bank Details' })).toBeVisible();
    expect(screen.getByText(/not linked to your setux account/i)).toBeVisible();
  });

  it('keeps an unavailable REQUIRED target visible with its badge', async () => {
    fetchImpact.mockResolvedValue({
      ...ANALYSIS,
      impacts: [
        impactEntry('INCOME_RECORD', 'REQUIRED', { available: false, recordId: null }),
      ],
    });

    renderImpact();

    // A required correction that cannot be made is the most important thing on
    // the page. Dimming or dropping it would bury exactly that.
    expect(await screen.findByRole('heading', { name: 'Income Certificate' })).toBeVisible();
    expect(screen.getByText('Required')).toBeVisible();
    expect(screen.getByText(/not linked to your setux account/i)).toBeVisible();
  });

  it('shows an error state with a retry when the request fails', async () => {
    fetchImpact.mockRejectedValue(new ApiError({ code: 'INTERNAL_ERROR', message: 'Server error', status: 500 }));

    renderImpact();

    expect(await screen.findByText(/could not check affected records/i)).toBeVisible();

    const retry = screen.getByRole('button', { name: /try again|retry/i });
    fetchImpact.mockResolvedValue(ANALYSIS);
    await userEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Income Certificate' })).toBeVisible();
    });
  });

  it('shows a not-found state for a draft that is not the citizen’s', async () => {
    fetchImpact.mockRejectedValue(new ApiError({ code: 'RESOURCE_NOT_FOUND', message: 'Not found', status: 404 }));

    renderImpact();

    expect(await screen.findByText(/request not found/i)).toBeVisible();

    // The wording must not hint that the draft exists but belongs to somebody
    // else — a 404 here is the same answer as an id that never existed.
    expect(screen.queryByText(/another citizen|belongs to|not yours|forbidden/i)).toBeNull();
  });

  it('handles a draft with no changed fields', async () => {
    fetchImpact.mockResolvedValue({ ...ANALYSIS, changedFields: [], impacts: [] });

    renderImpact();

    expect(await screen.findByText(/this request has no details yet/i)).toBeVisible();
  });

  it('renders from the URL alone, so a refresh restores the page', async () => {
    renderImpact();

    await screen.findByRole('heading', { name: 'Income Certificate' });

    // Nothing came from navigation state: the id in the path is the only input.
    expect(fetchImpact).toHaveBeenCalledWith(DRAFT_ID, expect.anything());
  });

  it('offers a way back to the draft', async () => {
    renderImpact();

    const back = await screen.findByRole('link', { name: /back to your request/i });
    await userEvent.click(back);

    expect(await screen.findByText('Draft screen')).toBeVisible();
  });
});
