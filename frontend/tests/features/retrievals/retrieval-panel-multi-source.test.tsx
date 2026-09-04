import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The retrieval panel with an application spanning FOUR government systems.
 *
 * Phase 8 rendered one row, so the questions it could not ask are the ones
 * here: are the sources distinguishable, does each carry its own state and its
 * own action, and does one system answering (or failing) leave the others
 * alone. An application on the seeded SCHOLARSHIP_MERIT service names all four
 * sources, which is what these render.
 */

vi.mock('@/features/retrievals/services/retrieval-service', () => ({
  fetchApplicationRetrievals: vi.fn(),
  createApplicationRetrieval: vi.fn(),
}));

const service = await import('@/features/retrievals/services/retrieval-service');
const { RetrievalPanel } = await import('@/features/retrievals');

const mocks = {
  fetch: vi.mocked(service.fetchApplicationRetrievals),
  create: vi.mocked(service.createApplicationRetrieval),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const RETRIEVED_AT = '2026-09-05T09:00:00.000Z';

type Availability =
  | 'AVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_DENIED'
  | 'COMPLETED'
  | 'RETRYABLE'
  | 'NOT_SUPPORTED';

interface SourceSpec {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly information: string;
  readonly source: string;
  readonly issuer: string;
  readonly reference: string;
  readonly value: { readonly label: string; readonly value: string };
}

const SOURCES = {
  identity: {
    requirementId: 'a1111111-1111-4111-8111-111111111111',
    requirementCode: 'IDENTITY',
    information: 'Identity Verification',
    source: 'Identity Registry (Mock)',
    issuer: 'Demo Identity Registry (Simulated)',
    reference: 'SYNTH-ID-ABCDEF123456',
    value: { label: 'Identity match', value: 'MATCHED' },
  },
  education: {
    requirementId: 'a2222222-2222-4222-8222-222222222222',
    requirementCode: 'EDUCATION_RECORD',
    information: 'Class 12 Result',
    source: 'Education Department (Mock)',
    issuer: 'Demo State Education Board (Simulated)',
    reference: 'SYNTH-EDU-ABCDEF123456',
    value: { label: 'Aggregate', value: '82.4' },
  },
  income: {
    requirementId: 'a3333333-3333-4333-8333-333333333333',
    requirementCode: 'INCOME_RECORD',
    information: 'Income Certificate',
    source: 'Income & Revenue Department (Mock)',
    issuer: 'Demo Revenue Department (Simulated)',
    reference: 'SYNTH-INC-ABCDEF123456',
    value: { label: 'Income band', value: 'BELOW_THRESHOLD' },
  },
  bank: {
    requirementId: 'a4444444-4444-4444-8444-444444444444',
    requirementCode: 'BANK_DETAILS',
    information: 'Bank Account Proof',
    source: 'DigiLocker (Mock)',
    issuer: 'Demo Public Bank (Simulated)',
    reference: 'SYNTH-DL-ABCDEF123456',
    value: { label: 'Account number', value: 'XXXXXX4409' },
  },
} as const satisfies Record<string, SourceSpec>;

type SourceKey = keyof typeof SOURCES;

const item = (key: SourceKey, availability: Availability, failureReason?: string) => {
  const spec = SOURCES[key];
  const completed = availability === 'COMPLETED';
  return {
    requirementId: spec.requirementId,
    requirementCode: spec.requirementCode,
    information: spec.information,
    source: spec.source,
    isSimulated: true,
    availability,
    status: completed
      ? ('SUCCESS' as const)
      : availability === 'RETRYABLE'
        ? ('FAILED' as const)
        : null,
    documentType: completed ? spec.requirementCode : null,
    providerReference: completed ? spec.reference : null,
    issuer: completed ? spec.issuer : null,
    retrievedAt: completed ? RETRIEVED_AT : null,
    values: completed ? [spec.value] : [],
    failureReason: failureReason ?? null,
  };
};

const payload = (items: ReturnType<typeof item>[]) => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000013',
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

/** The list item for one requirement, found by its heading. */
const rowFor = async (key: SourceKey) => {
  const heading = await screen.findByRole('heading', { name: SOURCES[key].information });
  const row = heading.closest('li');
  expect(row).not.toBeNull();
  return within(row as HTMLElement);
};

/**
 * The status badge inside one row.
 *
 * Matched on the badge element itself rather than on its text: "Retrieved" is
 * also the <dt> label of the retrieval timestamp, so a bare text query
 * legitimately finds two elements.
 */
const badgeIn = (row: ReturnType<typeof within>, label: string) =>
  row.getByText(
    (_content: string, element: Element | null) =>
      element?.getAttribute('data-slot') === 'badge' && element.textContent?.trim() === label,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an application spanning four government systems', () => {
  beforeEach(() => {
    mocks.fetch.mockResolvedValue(
      payload([
        item('identity', 'AVAILABLE'),
        item('education', 'CONSENT_REQUIRED'),
        item('income', 'CONSENT_DENIED'),
        item('bank', 'COMPLETED'),
      ]),
    );
  });

  it('renders one row per requirement, in the order the server sent', async () => {
    renderPanel();

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Identity Verification',
      'Class 12 Result',
      'Income Certificate',
      'Bank Account Proof',
    ]);
  });

  it('names the government system each requirement comes from', async () => {
    renderPanel();

    for (const key of Object.keys(SOURCES) as SourceKey[]) {
      const row = await rowFor(key);
      // The subtitle under the requirement heading, not the button label —
      // both legitimately name the source.
      const subtitle = row.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' && element.textContent?.trim().startsWith(SOURCES[key].source),
        ),
      );
      expect(subtitle).toBeVisible();
    }
  });

  it('marks every source as simulated, so none reads as a live integration', async () => {
    renderPanel();

    await screen.findByRole('heading', { name: 'Identity Verification' });
    expect(screen.getAllByText(/Simulated/u).length).toBeGreaterThanOrEqual(4);
  });

  it('gives each requirement its own state, not one state for the panel', async () => {
    renderPanel();

    expect(badgeIn(await rowFor('identity'), 'Ready to fetch')).toBeVisible();
    expect(badgeIn(await rowFor('education'), 'Consent needed')).toBeVisible();
    expect(badgeIn(await rowFor('income'), 'Denied')).toBeVisible();
    expect(badgeIn(await rowFor('bank'), 'Retrieved')).toBeVisible();
  });

  it('offers an action only where consent allows it', async () => {
    renderPanel();

    expect((await rowFor('identity')).getByRole('button', { name: /fetch from/iu })).toBeEnabled();
    expect((await rowFor('education')).queryByRole('button', { name: /fetch from/iu })).toBeNull();
    expect((await rowFor('income')).queryByRole('button', { name: /fetch from/iu })).toBeNull();
    // Already retrieved: no repeat action.
    expect((await rowFor('bank')).queryByRole('button', { name: /fetch from/iu })).toBeNull();
  });

  it('shows retrieved values only against the source that supplied them', async () => {
    renderPanel();

    const bank = await rowFor('bank');
    expect(bank.getByText('XXXXXX4409')).toBeVisible();
    expect(bank.getByText('Demo Public Bank (Simulated)')).toBeVisible();

    // No other row shows a value, and no other issuer appears anywhere.
    const identity = await rowFor('identity');
    expect(identity.queryByText('XXXXXX4409')).toBeNull();
    expect(screen.queryByText('Demo Revenue Department (Simulated)')).toBeNull();
  });

  it('gives every action a distinct accessible name', async () => {
    mocks.fetch.mockResolvedValue(
      payload([
        item('identity', 'AVAILABLE'),
        item('education', 'AVAILABLE'),
        item('income', 'AVAILABLE'),
        item('bank', 'AVAILABLE'),
      ]),
    );
    renderPanel();

    const buttons = await screen.findAllByRole('button', { name: /fetch from/iu });
    const names = buttons.map((button) => button.textContent?.replace(/\s+/gu, ' ').trim());
    expect(names).toHaveLength(4);
    // Ambiguous repeated names would make the buttons indistinguishable in a
    // screen reader's element list (Phase 9 §44).
    expect(new Set(names).size).toBe(4);
    for (const key of Object.keys(SOURCES) as SourceKey[]) {
      expect(names.some((name) => name?.includes(SOURCES[key].information))).toBe(true);
    }
  });
});

describe('sources without a connector', () => {
  it('still says "Not available yet" and offers no action', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item('identity', 'AVAILABLE'), item('education', 'NOT_SUPPORTED')]),
    );
    renderPanel();

    const education = await rowFor('education');
    expect(education.getByText('Not available yet')).toBeVisible();
    expect(education.getByText(/not connected to SetuX yet/iu)).toBeVisible();
    expect(education.queryByRole('button')).toBeNull();

    // A connected source in the same panel is unaffected.
    expect((await rowFor('identity')).getByRole('button', { name: /fetch from/iu })).toBeEnabled();
  });

  it('does not offer an action merely because consent was granted', async () => {
    // Availability is the server's judgement; a granted consent alone is not
    // enough when no connector serves the source (Phase 9 §38).
    mocks.fetch.mockResolvedValue(payload([item('income', 'NOT_SUPPORTED')]));
    renderPanel();

    await screen.findByText('Not available yet');
    expect(screen.queryByRole('button', { name: /fetch/iu })).toBeNull();
  });
});

describe('retrieving one source does not disturb the others', () => {
  beforeEach(() => {
    mocks.fetch.mockResolvedValue(
      payload([
        item('education', 'AVAILABLE'),
        item('income', 'AVAILABLE'),
        item('bank', 'COMPLETED'),
      ]),
    );
  });

  it('leaves the other actions usable while one request is in flight', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    mocks.create.mockReturnValue(
      new Promise((r) => {
        resolve = r as (value: unknown) => void;
      }) as ReturnType<typeof service.createApplicationRetrieval>,
    );
    renderPanel();

    const education = await rowFor('education');
    await userEvent.click(education.getByRole('button', { name: /fetch from/iu }));

    // The row being fetched shows its own pending state...
    expect(await education.findByRole('button', { name: /fetching/iu })).toBeDisabled();
    // ...and the unrelated government system is still actionable.
    const income = await rowFor('income');
    expect(income.getByRole('button', { name: /fetch from/iu })).toBeEnabled();

    resolve?.(
      payload([
        item('education', 'COMPLETED'),
        item('income', 'AVAILABLE'),
        item('bank', 'COMPLETED'),
      ]),
    );
  });

  it('marks only the retrieved source as Retrieved', async () => {
    mocks.create.mockResolvedValue(
      payload([
        item('education', 'COMPLETED'),
        item('income', 'AVAILABLE'),
        item('bank', 'COMPLETED'),
      ]),
    );
    renderPanel();

    const education = await rowFor('education');
    await userEvent.click(education.getByRole('button', { name: /fetch from/iu }));

    await waitFor(async () => {
      expect(badgeIn(await rowFor('education'), 'Retrieved')).toBeVisible();
    });
    expect(badgeIn(await rowFor('income'), 'Ready to fetch')).toBeVisible();
    expect(mocks.create).toHaveBeenCalledWith(APPLICATION_ID, SOURCES.education.requirementId);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('keeps already-retrieved data visible when another source fails', async () => {
    mocks.create.mockRejectedValue(new Error('The government system did not respond.'));
    renderPanel();

    const income = await rowFor('income');
    await userEvent.click(income.getByRole('button', { name: /fetch from/iu }));

    // The failure is announced on its own row...
    const alert = await screen.findByRole('alert');
    expect(alert).toBeVisible();
    // ...and the source that already succeeded still shows its data.
    const bank = await rowFor('bank');
    expect(badgeIn(bank, 'Retrieved')).toBeVisible();
    expect(bank.getByText('XXXXXX4409')).toBeVisible();
  });

  it('reports a failure against the requirement that was attempted', async () => {
    mocks.create.mockRejectedValue(new Error('The government system did not respond.'));
    renderPanel();

    const income = await rowFor('income');
    await userEvent.click(income.getByRole('button', { name: /fetch from/iu }));

    await screen.findByRole('alert');
    // Exactly one row carries the error, and it is the one that was clicked.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect((await rowFor('income')).getByRole('alert')).toBeVisible();
    expect((await rowFor('education')).queryByRole('alert')).toBeNull();
  });
});

describe('language across several systems', () => {
  it('never claims any source has been verified or approved', async () => {
    mocks.fetch.mockResolvedValue(
      payload([
        item('identity', 'COMPLETED'),
        item('education', 'COMPLETED'),
        item('income', 'COMPLETED'),
        item('bank', 'COMPLETED'),
      ]),
    );
    const { container } = renderPanel();

    await screen.findByRole('heading', { name: 'Identity Verification' });
    const text = container.textContent ?? '';
    // "Identity Verification" is the requirement's own seeded name; the claim
    // that SetuX has verified something is what must not appear (Phase 9 §41).
    expect(text).not.toMatch(/\bverified\b/iu);
    expect(text).not.toMatch(/government verified|officially approved|validated/iu);
    expect(text).toMatch(/have not yet been checked/iu);
  });
});
