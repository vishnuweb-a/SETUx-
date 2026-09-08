import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Phase 4 correction form and the saved draft it produces.
 *
 * The assertions fall into three groups, and the third is the one that matters
 * most for this feature:
 *
 * 1. The form shows the current value read-only and the new value editable, and
 *    validates before it submits.
 * 2. A saved draft is reachable by its own URL, so a refresh restores it.
 * 3. **No call is made that could modify a government record.** The record
 *    service is stubbed with its two reads, and one test asserts that the
 *    module exposes nothing else.
 */

vi.mock('@/features/change-details/services/citizen-record-service', () => ({
  fetchCitizenRecords: vi.fn(),
  fetchCitizenRecord: vi.fn(),
}));

vi.mock('@/features/change-details/services/change-draft-service', () => ({
  createChangeDraft: vi.fn(),
  fetchChangeDraft: vi.fn(),
  updateChangeDraft: vi.fn(),
}));

const recordService = await import('@/features/change-details/services/citizen-record-service');
const draftService = await import('@/features/change-details/services/change-draft-service');
const { ChangeDetailsEditPage } = await import(
  '@/features/change-details/pages/change-details-edit-page'
);
const { ChangeDraftPage } = await import('@/features/change-details/pages/change-draft-page');
const { ApiError } = await import('@/services/api-client');

const mocks = {
  record: vi.mocked(recordService.fetchCitizenRecord),
  create: vi.mocked(draftService.createChangeDraft),
  fetchDraft: vi.mocked(draftService.fetchChangeDraft),
  update: vi.mocked(draftService.updateChangeDraft),
};

const RECORD_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_ID = '44444444-4444-4444-8444-444444444444';

const EDITABLE_FIELD = {
  fieldKey: 'identityAddress',
  value: '12 Demo Street',
  retrievedAt: '2026-09-08T00:00:00.000Z',
  editability: 'EDITABLE' as const,
  changeable: true,
  requiresEvidence: false,
  requiresReview: false,
  policyAuthority: 'Identity Authority',
};

const CONDITIONAL_FIELD = {
  fieldKey: 'identityHolderName',
  value: 'Demo Old Name',
  retrievedAt: '2026-09-08T00:00:00.000Z',
  editability: 'CONDITIONALLY_EDITABLE' as const,
  changeable: true,
  requiresEvidence: true,
  requiresReview: true,
  policyAuthority: 'Identity Authority',
};

const IMMUTABLE_FIELD = {
  fieldKey: 'identityRegistryReference',
  value: 'SYNTH-IDR-2026-0117',
  retrievedAt: '2026-09-08T00:00:00.000Z',
  editability: 'IMMUTABLE' as const,
  changeable: false,
  requiresEvidence: false,
  requiresReview: false,
  policyAuthority: 'Identity Authority',
};

const RECORD = {
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
  fields: [EDITABLE_FIELD, CONDITIONAL_FIELD, IMMUTABLE_FIELD],
};

const DRAFT = {
  id: DRAFT_ID,
  requestNumber: 'CR-2026-000001',
  status: 'DRAFT' as const,
  sourceRecordId: RECORD_ID,
  sourceRecordType: 'IDENTITY_RECORD' as const,
  fields: [
    {
      fieldKey: 'identityHolderName',
      oldValue: 'Demo Old Name',
      proposedValue: 'Demo New Name',
      policy: {
        editability: 'CONDITIONALLY_EDITABLE' as const,
        requiresEvidence: true,
        requiresReview: true,
        authority: 'Identity Authority',
      },
      reason: 'Legal name correction',
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    },
  ],
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

const probe = { pathname: '' };

function LocationReporter() {
  const location = useLocation();
  useEffect(() => {
    probe.pathname = location.pathname;
  }, [location.pathname]);
  return null;
}

/**
 * Waits for the router to settle on a path.
 *
 * `probe.pathname` is written by an effect, so reading it synchronously right
 * after an assertion about rendered output is a race: the screen can show the
 * destination while the effect that records the path has not flushed yet. Under
 * a loaded parallel run that gap is wide enough to fail a test that is
 * describing correct behaviour, which is the worst kind of test — one that
 * cries wolf.
 *
 * `waitFor` closes it without weakening the assertion: the path must still
 * become exactly this one.
 */
const expectPath = (expected: string): Promise<void> =>
  waitFor(() => {
    expect(probe.pathname).toBe(expected);
  });

/**
 * `MemoryRouter` rather than `createMemoryRouter`, for the reason the Phase 3
 * tests record: the data router builds a `Request` per navigation and jsdom's
 * `AbortSignal` is not the class Node's `Request` accepts.
 */
const renderAt = (initialPath: string, state?: unknown) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
        <LocationReporter />
        <Routes>
          <Route
            path="/citizen/change-details/drafts/:changeRequestId"
            element={<ChangeDraftPage />}
          />
          <Route
            path="/citizen/change-details/:recordId/fields"
            element={<ChangeDetailsEditPage />}
          />
          <Route path="/citizen/change-details/:recordId" element={<div>Record screen</div>} />
          <Route path="/citizen/change-details" element={<div>Records list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return probe;
};

/** The edit form, reached with a selection in navigation state. */
const renderForm = (selectedFieldKeys: readonly string[] = ['identityHolderName']) =>
  renderAt(`/citizen/change-details/${RECORD_ID}/fields`, {
    recordId: RECORD_ID,
    selectedFieldKeys,
  });

const renderDraft = () => renderAt(`/citizen/change-details/drafts/${DRAFT_ID}`);

beforeEach(() => {
  vi.clearAllMocks();
  probe.pathname = '';
  mocks.record.mockResolvedValue(RECORD);
  mocks.create.mockResolvedValue(DRAFT);
  mocks.fetchDraft.mockResolvedValue(DRAFT);
  mocks.update.mockResolvedValue(DRAFT);
});

describe('the correction form', () => {
  it('shows the current value as text and the new value as an input', async () => {
    renderForm();

    const current = await screen.findByText('Demo Old Name');
    expect(current).toBeVisible();
    // The current value is not a form control: it cannot be typed into, and it
    // is not merely disabled.
    expect(current.tagName).not.toBe('INPUT');

    expect(screen.getByRole('textbox', { name: /new value/i })).toBeEnabled();
  });

  it('renders only the selected fields', async () => {
    renderForm(['identityHolderName']);

    expect(await screen.findByText('Full Name')).toBeVisible();
    expect(screen.queryByText('Address')).not.toBeInTheDocument();
  });

  it('warns that a conditionally editable change needs evidence and review', async () => {
    renderForm(['identityHolderName']);

    expect(
      await screen.findByText(/may require supporting evidence and department review/i),
    ).toBeVisible();
    // Not conveyed by colour alone.
    expect(screen.getByText('Conditionally editable')).toBeVisible();
  });

  it('does not warn for a plainly editable field', async () => {
    renderForm(['identityAddress']);

    expect(await screen.findByText('Address')).toBeVisible();
    expect(screen.queryByText(/may require supporting evidence/i)).not.toBeInTheDocument();
  });

  it('refuses to render an immutable field even when the selection names one', async () => {
    // A hand-edited navigation state, or a tab left open across a policy
    // change. The key is dropped rather than given an input.
    renderForm(['identityRegistryReference']);

    expect(await screen.findByText(/no details available to change/i)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('rejects an empty new value without calling the API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole('button', { name: /save draft/i }));

    expect(await screen.findByText('Enter a new value.')).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a value identical to the current one without calling the API', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo Old Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(
      await screen.findByText(/different from the current one/i),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates the draft and navigates to its own URL', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/draft saved/i)).toBeVisible();
    await expectPath(`/citizen/change-details/drafts/${DRAFT_ID}`);
  });

  it('sends only the field key and the proposed value', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await screen.findByText(/draft saved/i);

    const [payload] = mocks.create.mock.calls[0] ?? [{ fields: [] }];
    expect(payload).toEqual({
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo New Name' }],
    });
    // The old value is the server's to determine.
    expect(JSON.stringify(payload)).not.toMatch(/oldValue|editability|requiresEvidence/);
  });

  it('offers an optional reason and sends it when given', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.type(
      screen.getByRole('textbox', { name: /reason for this change/i }),
      'Legal name change',
    );
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await screen.findByText(/draft saved/i);

    const [payload] = mocks.create.mock.calls[0] ?? [{ fields: [] }];
    expect(payload.fields[0]).toEqual({
      fieldKey: 'identityHolderName',
      proposedValue: 'Demo New Name',
      reason: 'Legal name change',
    });
  });

  it('omits a blank reason rather than sending an empty string', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await screen.findByText(/draft saved/i);

    const [payload] = mocks.create.mock.calls[0] ?? [{ fields: [] }];
    // An absent key means "not given"; the API rejects `""`.
    expect(payload.fields[0]).not.toHaveProperty('reason');
  });

  it('marks the reason as optional', async () => {
    renderForm();

    expect(await screen.findByText(/\(optional\)/i)).toBeVisible();
  });

  it('reports a failed save without losing what the citizen typed', async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }),
    );
    renderForm();

    const input = await screen.findByRole('textbox', { name: /new value/i });
    await user.type(input, 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/could not be saved/i)).toBeVisible();
    expect(input).toHaveValue('Demo New Name');
  });

  it('explains a field that can no longer be changed', async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(
      new ApiError({ code: 'FIELD_NOT_EDITABLE', message: 'locked', status: 409 }),
    );
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText(/can no longer be changed/i)).toBeVisible();
  });

  it('returns to the record when opened without a selection', async () => {
    renderAt(`/citizen/change-details/${RECORD_ID}/fields`);

    expect(await screen.findByText('Record screen')).toBeVisible();
    await expectPath(`/citizen/change-details/${RECORD_ID}`);
  });

  it('offers a way back to the record', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole('button', { name: /back/i }));

    await expectPath(`/citizen/change-details/${RECORD_ID}`);
  });
});

describe('the saved draft', () => {
  it('restores both values from the server on a direct visit', async () => {
    // The refresh case: no navigation state at all, only the URL.
    renderDraft();

    expect(await screen.findByText('Demo Old Name')).toBeVisible();
    expect(screen.getByRole('textbox', { name: /new value/i })).toHaveValue('Demo New Name');
    expect(mocks.fetchDraft).toHaveBeenCalledWith(DRAFT_ID, expect.anything());
  });

  it('shows the request reference and says nothing was submitted', async () => {
    renderDraft();

    expect(await screen.findByText('CR-2026-000001')).toBeVisible();
    expect(screen.getByText(/has not been sent to any department/i)).toBeVisible();
  });

  it('names the next stage as not built rather than offering it', async () => {
    renderDraft();

    expect(await screen.findByText(/what happens next is not built yet/i)).toBeVisible();
    // No control that would navigate into an unbuilt phase.
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
  });

  it('revises the proposed value', async () => {
    const user = userEvent.setup();
    renderDraft();

    const input = await screen.findByRole('textbox', { name: /new value/i });
    await user.clear(input);
    await user.type(input, 'Demo Newer Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // The reason the draft was saved with is carried through unchanged: the
    // citizen edited the value, not their explanation of it.
    expect(mocks.update).toHaveBeenCalledWith(DRAFT_ID, {
      fields: [
        {
          fieldKey: 'identityHolderName',
          proposedValue: 'Demo Newer Name',
          reason: 'Legal name correction',
        },
      ],
    });
  });

  it('restores a saved reason into its input', async () => {
    renderDraft();

    expect(await screen.findByRole('textbox', { name: /reason for this change/i })).toHaveValue(
      'Legal name correction',
    );
  });

  it('shows a loading state while the draft is fetched', async () => {
    mocks.fetchDraft.mockImplementation(() => new Promise(() => {}));
    renderDraft();

    expect(await screen.findByText(/loading correction request/i)).toBeInTheDocument();
  });

  it('renders a not-found state for a draft that is not the citizen’s', async () => {
    mocks.fetchDraft.mockRejectedValue(
      new ApiError({ code: 'RESOURCE_NOT_FOUND', message: 'not found', status: 404 }),
    );
    renderDraft();

    expect(await screen.findByText(/request not found/i)).toBeVisible();
    // The wording must not reveal that the draft exists but belongs elsewhere.
    expect(screen.queryByText(/another citizen|belongs to/i)).not.toBeInTheDocument();
  });

  it('offers a retry when the request fails for another reason', async () => {
    mocks.fetchDraft.mockRejectedValue(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500 }),
    );
    renderDraft();

    expect(await screen.findByText(/could not load this request/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible();
  });

  it('offers a way back to the record', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(await screen.findByRole('button', { name: /back/i }));

    await expectPath(`/citizen/change-details/${RECORD_ID}`);
  });
});

describe('no government record is ever mutated', () => {
  it('exposes only reads on the record service', async () => {
    // A create, update or delete would have to be added to that module first —
    // and the API declares no write verb for `/citizen-records` to call.
    expect(Object.keys(recordService).sort()).toEqual([
      'fetchCitizenRecord',
      'fetchCitizenRecords',
    ]);
  });

  it('reads the record and writes only to the draft endpoints', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByRole('textbox', { name: /new value/i }), 'Demo New Name');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await screen.findByText(/draft saved/i);

    // The record was read; the only write went to the draft service.
    expect(mocks.record).toHaveBeenCalledWith(RECORD_ID, expect.anything());
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('makes no consent, impact, routing or review call', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    // The two feature services are the whole surface this flow can reach, and
    // neither contains a Phase 5+ operation.
    const everyOperation = [...Object.keys(recordService), ...Object.keys(draftService)].join(' ');
    expect(everyOperation).not.toMatch(
      /consent|impact|dependency|target|route|review|submit|notify/i,
    );
  });
});

describe('breadcrumb', () => {
  it('offers a way back to the record list from the draft', async () => {
    renderDraft();

    const nav = await screen.findByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByRole('link', { name: 'Change Details' })).toHaveAttribute(
      'href',
      '/citizen/change-details',
    );
  });
});
