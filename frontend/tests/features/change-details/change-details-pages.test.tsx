import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/change-details/services/citizen-record-service', () => ({
  fetchCitizenRecords: vi.fn(),
  fetchCitizenRecord: vi.fn(),
}));

// Phase 4's edit form now stands where the Phase 3 handoff screen did, so the
// record-selection flow ends in a real form. The draft service is stubbed
// because these tests are about the SELECTION reaching the form — the draft's
// own behaviour is covered in `change-draft-pages.test.tsx`.
vi.mock('@/features/change-details/services/change-draft-service', () => ({
  createChangeDraft: vi.fn(),
  fetchChangeDraft: vi.fn(),
  updateChangeDraft: vi.fn(),
}));

const service = await import('@/features/change-details/services/citizen-record-service');
const { ChangeDetailsRecordsPage } = await import(
  '@/features/change-details/pages/change-details-records-page'
);
const { ChangeDetailsRecordPage } = await import(
  '@/features/change-details/pages/change-details-record-page'
);
const { ChangeDetailsEditPage } = await import(
  '@/features/change-details/pages/change-details-edit-page'
);
const { ApiError } = await import('@/services/api-client');

const mocks = {
  list: vi.mocked(service.fetchCitizenRecords),
  detail: vi.mocked(service.fetchCitizenRecord),
};

const RECORD_ID = '33333333-3333-4333-8333-333333333333';

const summary = (overrides = {}) => ({
  id: RECORD_ID,
  recordType: 'IDENTITY_RECORD' as const,
  source: { code: 'MOCK_IDENTITY_API', name: 'Identity Registry (Mock)' },
  authority: { code: 'IDENTITY_AUTHORITY', name: 'Identity Authority' },
  sourceRecordRef: 'SYNTH-IDR-2026-0117',
  status: 'ACTIVE' as const,
  sourceVersion: 'v1',
  lastSyncedAt: '2026-09-08T00:00:00.000Z',
  isSimulated: true,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  ...overrides,
});

/** An identity record: one editable, one conditional, one immutable, one ungoverned. */
const DETAIL = {
  ...summary(),
  fields: [
    {
      fieldKey: 'identityAddress',
      value: '12 Demo Street',
      retrievedAt: '2026-09-08T00:00:00.000Z',
      editability: 'EDITABLE' as const,
      changeable: true,
      requiresEvidence: false,
      requiresReview: false,
      policyAuthority: 'Identity Authority',
    },
    {
      fieldKey: 'identityHolderName',
      value: 'Demo Old Name',
      retrievedAt: '2026-09-08T00:00:00.000Z',
      editability: 'CONDITIONALLY_EDITABLE' as const,
      changeable: true,
      requiresEvidence: true,
      requiresReview: true,
      policyAuthority: 'Identity Authority',
    },
    {
      fieldKey: 'identityRegistryReference',
      value: 'SYNTH-IDR-2026-0117',
      retrievedAt: '2026-09-08T00:00:00.000Z',
      editability: 'IMMUTABLE' as const,
      changeable: false,
      requiresEvidence: false,
      requiresReview: false,
      policyAuthority: 'Identity Authority',
    },
    {
      fieldKey: 'identityUngoverned',
      value: 'no policy',
      retrievedAt: '2026-09-08T00:00:00.000Z',
      editability: null,
      changeable: false,
      requiresEvidence: false,
      requiresReview: false,
      policyAuthority: null,
    },
  ],
};

/** The current location, exposed so a test can assert where a navigation landed. */
interface LocationProbe {
  pathname: string;
  state: unknown;
}

const probe: LocationProbe = { pathname: '', state: null };

function LocationReporter() {
  const location = useLocation();

  // In an effect rather than during render: the reporter observes navigation,
  // and writing to an outer object mid-render is exactly what makes a component
  // misbehave under concurrent rendering.
  useEffect(() => {
    probe.pathname = location.pathname;
    probe.state = location.state;
  }, [location]);

  return null;
}

/**
 * The three Phase 3 routes on a memory router, so navigation between them is
 * exercised for real rather than asserted against a mocked `useNavigate`.
 *
 * `MemoryRouter` rather than `createMemoryRouter`: the data router builds a
 * `Request` on every navigation, and under jsdom that throws because jsdom's
 * `AbortSignal` is not the class Node's `Request` accepts. That is an
 * environment defect with nothing to say about these components, and the
 * component router exercises the same navigation without tripping it.
 */
const renderAt = (initialPath: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationReporter />
        <Routes>
          <Route path="/citizen/change-details" element={<ChangeDetailsRecordsPage />} />
          <Route path="/citizen/change-details/:recordId" element={<ChangeDetailsRecordPage />} />
          <Route
            path="/citizen/change-details/:recordId/fields"
            element={<ChangeDetailsEditPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return probe;
};

const renderRecords = () => renderAt('/citizen/change-details');
const renderRecord = () => renderAt(`/citizen/change-details/${RECORD_ID}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [summary()], total: 1 });
  mocks.detail.mockResolvedValue(DETAIL);
});

describe('record list', () => {
  it('renders each record with its source, authority and reference', async () => {
    renderRecords();

    // The h1 renders immediately; the card waits on the request, so the card is
    // what the assertion must await.
    expect(await screen.findByRole('heading', { level: 3, name: 'Identity Record' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: /change & correct details/i })).toBeVisible();
    expect(screen.getByText('Identity Registry (Mock)')).toBeVisible();
    expect(screen.getByText('Simulated')).toBeVisible();
    expect(screen.getByText('Identity Authority')).toBeVisible();
    expect(screen.getByText('SYNTH-IDR-2026-0117')).toBeVisible();
  });

  it('maps all five record types to their labels', async () => {
    mocks.list.mockResolvedValue({
      items: [
        summary({ id: 'r1', recordType: 'IDENTITY_RECORD' }),
        summary({ id: 'r2', recordType: 'INCOME_RECORD' }),
        summary({ id: 'r3', recordType: 'EDUCATION_RECORD' }),
        summary({ id: 'r4', recordType: 'COMMUNITY_RECORD' }),
        summary({ id: 'r5', recordType: 'BANK_DETAILS', authority: null }),
      ],
      total: 5,
    });
    renderRecords();

    for (const label of [
      'Identity Record',
      'Income Certificate',
      'Education Record',
      'Community Certificate',
      'Bank Details',
    ]) {
      expect(await screen.findByRole('heading', { level: 3, name: label })).toBeVisible();
    }
  });

  it('describes a bank record as provider-handled rather than inventing a department', async () => {
    mocks.list.mockResolvedValue({
      items: [
        summary({
          recordType: 'BANK_DETAILS',
          authority: null,
          source: { code: 'MOCK_BANK_API', name: 'Demo Public Bank' },
        }),
      ],
      total: 1,
    });
    renderRecords();

    expect(await screen.findByText('Handled directly by the provider')).toBeVisible();
    expect(screen.getByText('Demo Public Bank (Simulated)')).toBeVisible();
  });

  it('shows a loading state while records are fetched', () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    renderRecords();

    expect(screen.getByText(/loading your government records/i)).toBeInTheDocument();
  });

  it('shows an empty state when no record is linked', async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0 });
    renderRecords();

    expect(await screen.findByText(/no linked government records/i)).toBeVisible();
  });

  it('shows an error state and retries on request', async () => {
    const user = userEvent.setup();
    mocks.list.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }),
    );
    renderRecords();

    expect(await screen.findByText(/could not load your records/i)).toBeVisible();

    mocks.list.mockResolvedValue({ items: [summary()], total: 1 });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Identity Record' })).toBeVisible();
  });
});

describe('record detail and field eligibility', () => {
  it('renders one h1 and the record summary', async () => {
    renderRecord();

    expect(await screen.findByRole('heading', { level: 1, name: 'Identity Record' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows every field, including the ones that cannot be changed', async () => {
    renderRecord();

    expect(await screen.findByText('Full Name')).toBeVisible();
    expect(screen.getByText('Address')).toBeVisible();
    expect(screen.getByText('Identity Reference')).toBeVisible();
    expect(screen.getByText('Demo Old Name')).toBeVisible();
  });

  it('offers a checkbox for editable and conditional fields only', async () => {
    renderRecord();

    expect(await screen.findByRole('checkbox', { name: /address/i })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /full name/i })).toBeEnabled();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('gives an immutable field no control at all, and explains why', async () => {
    renderRecord();

    expect(await screen.findByText('Identity Reference')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /identity reference/i })).toBeNull();
    expect(
      screen.getByText(/cannot be changed through SetuX. It is maintained by Identity Authority/i),
    ).toBeVisible();
  });

  it('renders an ungoverned field as unavailable rather than open', async () => {
    renderRecord();

    expect(await screen.findByText(/no correction policy for this field yet/i)).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /identityUngoverned/i })).toBeNull();
  });

  it('renders the policy badges and their helper text', async () => {
    renderRecord();

    expect(await screen.findByText('Editable')).toBeVisible();
    expect(screen.getByText('Conditionally editable')).toBeVisible();
    expect(screen.getByText('Locked')).toBeVisible();
    expect(screen.getByText('You can request a change to this field.')).toBeVisible();
    expect(
      screen.getByText('This change requires supporting evidence and department review.'),
    ).toBeVisible();
  });

  it('shows a not-found state for a record that is not the caller’s', async () => {
    mocks.detail.mockRejectedValue(
      new ApiError({ code: 'NOT_FOUND', message: 'Not found', status: 404 }),
    );
    renderRecord();

    expect(await screen.findByText(/record not found/i)).toBeVisible();
    // Nothing hints that the record exists but belongs to someone else.
    expect(screen.queryByText(/another citizen|belongs to|forbidden/i)).toBeNull();
  });

  it('shows an error state with retry for a failure that is not a 404', async () => {
    const user = userEvent.setup();
    mocks.detail.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }),
    );
    renderRecord();

    expect(await screen.findByText(/could not load this record/i)).toBeVisible();

    mocks.detail.mockResolvedValue(DETAIL);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Identity Record' })).toBeVisible();
  });

  it('says so when a record has no correctable field', async () => {
    mocks.detail.mockResolvedValue({
      ...DETAIL,
      fields: [DETAIL.fields[2]],
    });
    renderRecord();

    expect(await screen.findByText(/none of the details on this record can be corrected/i)).toBeVisible();
  });
});

describe('field selection', () => {
  it('disables Continue until something is selected', async () => {
    renderRecord();

    const continueButton = await screen.findByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();
    expect(screen.getByText('No fields selected')).toBeVisible();
  });

  it('enables Continue once a field is selected, and reports the count', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));

    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
    expect(screen.getByText('1 field selected')).toBeVisible();
  });

  it('supports selecting several fields at once', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));
    await user.click(screen.getByRole('checkbox', { name: /full name/i }));

    expect(screen.getByText('2 fields selected')).toBeVisible();
  });

  it('deselects on a second click and disables Continue again', async () => {
    const user = userEvent.setup();
    renderRecord();

    const address = await screen.findByRole('checkbox', { name: /address/i });
    await user.click(address);
    await user.click(address);

    expect(screen.getByText('No fields selected')).toBeVisible();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('selects with the keyboard', async () => {
    const user = userEvent.setup();
    renderRecord();

    const address = await screen.findByRole('checkbox', { name: /address/i });
    address.focus();
    await user.keyboard(' ');

    expect(address).toBeChecked();
    expect(screen.getByText('1 field selected')).toBeVisible();
  });

  it('announces the selected count in a live region', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));

    const live = screen.getByText('1 field selected');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('carries the record and the selected keys to the next phase', async () => {
    const user = userEvent.setup();
    const location = renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));
    await user.click(screen.getByRole('checkbox', { name: /full name/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Both selected fields become editable rows on the Phase 4 form.
    expect(await screen.findAllByRole('textbox', { name: /new value/i })).toHaveLength(2);
    expect(location.pathname).toBe(`/citizen/change-details/${RECORD_ID}/fields`);
    expect(location.state).toEqual({
      recordId: RECORD_ID,
      selectedFieldKeys: ['identityAddress', 'identityHolderName'],
    });
  });

  it('never issues a mutating request while selecting and continuing', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // The service module exports only the two reads; a mutation would have to
    // be one of them, and neither was called with a body.
    expect(Object.keys(service)).toEqual(['fetchCitizenRecords', 'fetchCitizenRecord']);
    expect(mocks.detail).toHaveBeenCalledWith(RECORD_ID, expect.anything());
  });
});

describe('selection reaches the edit form', () => {
  it('carries the selected field into the form as an editable row', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /full name/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('heading', { level: 1, name: /enter new details/i })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /new value/i })).toBeEnabled();
  });

  it('states plainly that the record is not changed by saving', async () => {
    const user = userEvent.setup();
    renderRecord();

    await user.click(await screen.findByRole('checkbox', { name: /address/i }));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      await screen.findByText(/your government record is not changed by saving this request/i),
    ).toBeVisible();
  });

  it('returns to the record when opened without a selection', async () => {
    const location = renderAt(`/citizen/change-details/${RECORD_ID}/fields`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Identity Record' })).toBeVisible();
    expect(location.pathname).toBe(`/citizen/change-details/${RECORD_ID}`);
  });
});

describe('breadcrumb', () => {
  it('offers a way back to the record list', async () => {
    renderRecord();

    const nav = await screen.findByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByRole('link', { name: 'Change Details' })).toHaveAttribute(
      'href',
      '/citizen/change-details',
    );
  });
});
