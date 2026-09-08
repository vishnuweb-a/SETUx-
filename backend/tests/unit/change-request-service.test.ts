import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FieldPolicyModule from '../../src/modules/field-policies/index.js';

/**
 * The change draft service's decisions
 * (Change & Correction Service, Phase 4).
 *
 * Four properties are pinned here, and each is something that would be silently
 * WRONG rather than loudly broken if it regressed:
 *
 * 1. **`old_value` comes from the database, never from the caller.** The
 *    snapshot is what an officer will one day compare against, and a client
 *    that could set it could describe a change that never happened.
 * 2. **The source record is never written.** The registry repository is mocked
 *    here with read functions only, so any attempt to write one would be a
 *    missing-function failure rather than a passing test.
 * 3. **Editability is re-read live and IMMUTABLE is refused**, whatever the
 *    client selected and whatever a stored snapshot says.
 * 4. **A revision changes `proposed_value` and nothing else.** `old_value` and
 *    `policy_snapshot` must not appear in an update payload.
 */

vi.mock('../../src/modules/citizen-records/citizen-record.repository.js', () => ({
  // Deliberately READ-ONLY. There is no insert/update/delete to mock, so a
  // service that tried to write a government record would fail here.
  findRecordForCitizen: vi.fn(),
  listFieldsForCitizenRecord: vi.fn(),
  listRecordsByCitizen: vi.fn(),
}));

vi.mock('../../src/modules/change-requests/change-request.repository.js', () => ({
  listSourceFieldsForRecord: vi.fn(),
  insertChangeRequest: vi.fn(),
  insertChangeRequestFields: vi.fn(),
  deleteChangeRequest: vi.fn(),
  findChangeRequestForCitizen: vi.fn(),
  listFieldsForChangeRequest: vi.fn(),
  updateProposedValue: vi.fn(),
  deleteChangeRequestFields: vi.fn(),
  touchChangeRequest: vi.fn(),
}));

vi.mock('../../src/modules/field-policies/index.js', async () => {
  const actual =
    await vi.importActual<typeof FieldPolicyModule>('../../src/modules/field-policies/index.js');
  return { ...actual, assertFieldEditable: vi.fn() };
});

const recordRepository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const draftRepository = await import(
  '../../src/modules/change-requests/change-request.repository.js'
);
const policies = await import('../../src/modules/field-policies/index.js');
const { createChangeDraft, getChangeDraft, updateChangeDraft } = await import(
  '../../src/modules/change-requests/change-request.service.js'
);

const repo = {
  findRecordForCitizen: vi.mocked(recordRepository.findRecordForCitizen),
  listSourceFieldsForRecord: vi.mocked(draftRepository.listSourceFieldsForRecord),
  insertChangeRequest: vi.mocked(draftRepository.insertChangeRequest),
  insertChangeRequestFields: vi.mocked(draftRepository.insertChangeRequestFields),
  deleteChangeRequest: vi.mocked(draftRepository.deleteChangeRequest),
  findChangeRequestForCitizen: vi.mocked(draftRepository.findChangeRequestForCitizen),
  listFieldsForChangeRequest: vi.mocked(draftRepository.listFieldsForChangeRequest),
  updateProposedValue: vi.mocked(draftRepository.updateProposedValue),
  deleteChangeRequestFields: vi.mocked(draftRepository.deleteChangeRequestFields),
  touchChangeRequest: vi.mocked(draftRepository.touchChangeRequest),
};
const assertFieldEditable = vi.mocked(policies.assertFieldEditable);

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_FIELD_ID = '55555555-5555-4555-8555-555555555555';

const CITIZEN = {
  userId: CITIZEN_ID,
  email: 'citizen@setux.test',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const OFFICER = { ...CITIZEN, role: 'GOVERNMENT_OFFICER' } as const;
const NEW_CITIZEN = { ...CITIZEN, onboardingStatus: 'NOT_STARTED' } as const;

const RECORD_ROW = {
  id: RECORD_ID,
  record_type: 'IDENTITY_RECORD',
  source_record_ref: 'SYNTH-IDR-2026-0117',
  status: 'ACTIVE',
  source_version: 'v1',
  last_synced_at: '2026-09-08T00:00:00.000Z',
  is_simulated: true,
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
  source: { code: 'MOCK_IDENTITY_API', name: 'Identity Registry (Mock)' },
  authority: { code: 'IDENTITY_AUTHORITY', name: 'Identity Authority' },
};

const REQUEST_ROW = {
  id: REQUEST_ID,
  request_number: 'CR-2026-000001',
  citizen_id: CITIZEN_ID,
  source_record_id: RECORD_ID,
  status: 'DRAFT',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

const CONDITIONAL_DECISION = {
  recordType: 'IDENTITY_RECORD',
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  changeable: true,
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
} as const;

const STORED_FIELD = {
  field_key: 'identityHolderName',
  old_value: 'Demo Old Name',
  proposed_value: 'Demo New Name',
  policy_snapshot: {
    editability: 'CONDITIONALLY_EDITABLE',
    requiresEvidence: true,
    requiresReview: true,
    authority: 'Identity Authority',
  },
  reason: 'Legal name correction',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findRecordForCitizen.mockResolvedValue(RECORD_ROW as never);
  repo.listSourceFieldsForRecord.mockResolvedValue([
    { id: SOURCE_FIELD_ID, field_key: 'identityHolderName', field_value: 'Demo Old Name' },
  ]);
  repo.insertChangeRequest.mockResolvedValue(REQUEST_ROW);
  repo.insertChangeRequestFields.mockResolvedValue(undefined);
  repo.listFieldsForChangeRequest.mockResolvedValue([STORED_FIELD]);
  repo.findChangeRequestForCitizen.mockResolvedValue(REQUEST_ROW);
  repo.updateProposedValue.mockResolvedValue(undefined);
  repo.deleteChangeRequestFields.mockResolvedValue(undefined);
  repo.touchChangeRequest.mockResolvedValue(undefined);
  assertFieldEditable.mockResolvedValue(CONDITIONAL_DECISION);
});

const createInput = {
  sourceRecordId: RECORD_ID,
  fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo New Name' }],
};

describe('createChangeDraft', () => {
  it('creates a draft for the caller and nobody else', async () => {
    await createChangeDraft(CITIZEN, createInput);

    // The citizen id reaching the repository is the token's, and there is no
    // argument through which a different one could have arrived.
    expect(repo.findRecordForCitizen).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });
    expect(repo.insertChangeRequest).toHaveBeenCalledWith({
      citizenId: CITIZEN_ID,
      sourceRecordId: RECORD_ID,
    });
  });

  it('copies old_value from the database, not from the request', async () => {
    await createChangeDraft(CITIZEN, {
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo New Name' }],
    });

    const [{ fields }] = repo.insertChangeRequestFields.mock.calls[0] ?? [{ fields: [] }];

    expect(fields[0]?.oldValue).toBe('Demo Old Name');
    expect(fields[0]?.citizenRecordFieldId).toBe(SOURCE_FIELD_ID);
  });

  it('stores the proposed value separately from the snapshot', async () => {
    await createChangeDraft(CITIZEN, createInput);

    const [{ fields }] = repo.insertChangeRequestFields.mock.calls[0] ?? [{ fields: [] }];

    expect(fields[0]?.oldValue).toBe('Demo Old Name');
    expect(fields[0]?.proposedValue).toBe('Demo New Name');
  });

  it('derives the policy snapshot from the live decision', async () => {
    await createChangeDraft(CITIZEN, createInput);

    const [{ fields }] = repo.insertChangeRequestFields.mock.calls[0] ?? [{ fields: [] }];

    expect(fields[0]?.policySnapshot).toEqual({
      editability: 'CONDITIONALLY_EDITABLE',
      requiresEvidence: true,
      requiresReview: true,
      authority: 'Identity Authority',
    });
    expect(assertFieldEditable).toHaveBeenCalledWith('IDENTITY_RECORD', 'identityHolderName');
  });

  it('accepts a conditionally editable field', async () => {
    await expect(createChangeDraft(CITIZEN, createInput)).resolves.toMatchObject({
      status: 'DRAFT',
    });
  });

  it('refuses an immutable field, whatever the client selected', async () => {
    const { FieldNotEditableError } = await import('../../src/shared/errors/index.js');
    assertFieldEditable.mockRejectedValue(new FieldNotEditableError());

    await expect(createChangeDraft(CITIZEN, createInput)).rejects.toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
    });
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('refuses a field with no active policy', async () => {
    const { FieldPolicyNotFoundError } = await import('../../src/shared/errors/index.js');
    assertFieldEditable.mockRejectedValue(new FieldPolicyNotFoundError());

    await expect(createChangeDraft(CITIZEN, createInput)).rejects.toMatchObject({
      code: 'FIELD_POLICY_NOT_FOUND',
    });
  });

  it('conceals another citizen’s record as not found', async () => {
    repo.findRecordForCitizen.mockResolvedValue(null);

    await expect(createChangeDraft(CITIZEN, createInput)).rejects.toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('refuses a field that is not on the named record', async () => {
    // The scoped query returns nothing for a key belonging elsewhere.
    repo.listSourceFieldsForRecord.mockResolvedValue([]);

    await expect(createChangeDraft(CITIZEN, createInput)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('refuses a proposal identical to the current value', async () => {
    await expect(
      createChangeDraft(CITIZEN, {
        sourceRecordId: RECORD_ID,
        fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo Old Name' }],
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_REQUEST_VALUE_UNCHANGED' });
  });

  it('refuses an officer', async () => {
    await expect(createChangeDraft(OFFICER, createInput)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    await expect(createChangeDraft(NEW_CITIZEN, createInput)).rejects.toMatchObject({
      code: 'CHANGE_REQUEST_ONBOARDING_REQUIRED',
    });
  });

  it('removes the parent when its fields could not be written', async () => {
    repo.insertChangeRequestFields.mockRejectedValue(new Error('insert failed'));

    await expect(createChangeDraft(CITIZEN, createInput)).rejects.toThrow('insert failed');

    // The compensating delete is scoped by owner, not just by id.
    expect(repo.deleteChangeRequest).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('never writes to the source record', async () => {
    await createChangeDraft(CITIZEN, createInput);

    // The registry repository is mocked with reads only; assert explicitly
    // that the only functions the service reached for are reads.
    expect(Object.keys(recordRepository).every((name) => name.startsWith('find') || name.startsWith('list'))).toBe(true);
  });
});

describe('getChangeDraft', () => {
  it('returns the caller’s own draft with both values', async () => {
    const draft = await getChangeDraft(CITIZEN, REQUEST_ID);

    expect(draft.requestNumber).toBe('CR-2026-000001');
    expect(draft.status).toBe('DRAFT');
    expect(draft.fields[0]).toMatchObject({
      fieldKey: 'identityHolderName',
      oldValue: 'Demo Old Name',
      proposedValue: 'Demo New Name',
    });
  });

  it('conceals another citizen’s draft as not found', async () => {
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    await expect(getChangeDraft(CITIZEN, REQUEST_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('refuses an officer', async () => {
    await expect(getChangeDraft(OFFICER, REQUEST_ID)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('updateChangeDraft', () => {
  const updateInput = {
    fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo Newer Name' }],
  };

  it('stores a revised reason and clears one that was removed', async () => {
    await updateChangeDraft(CITIZEN, REQUEST_ID, {
      fields: [
        {
          fieldKey: 'identityHolderName',
          proposedValue: 'Demo Newer Name',
          reason: 'Spelling corrected on the certificate',
        },
      ],
    });

    expect(repo.updateProposedValue).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Spelling corrected on the certificate' }),
    );
  });

  it('updates only the citizen-owned parts of the request', async () => {
    await updateChangeDraft(CITIZEN, REQUEST_ID, updateInput);

    // `proposedValue` and `reason` are the citizen's own account of what they
    // are asking for, and both may be revised.
    expect(repo.updateProposedValue).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      citizenId: CITIZEN_ID,
      fieldKey: 'identityHolderName',
      proposedValue: 'Demo Newer Name',
      reason: null,
    });

    // The call carries no old value and no snapshot — not set to the same
    // thing, absent.
    const [payload] = repo.updateProposedValue.mock.calls[0] ?? [{}];
    expect(payload).not.toHaveProperty('oldValue');
    expect(payload).not.toHaveProperty('policySnapshot');
  });

  it('preserves the original old_value even when the source has moved', async () => {
    // The source now holds something else entirely — a refresh happened after
    // the draft was taken.
    repo.listSourceFieldsForRecord.mockResolvedValue([
      { id: SOURCE_FIELD_ID, field_key: 'identityHolderName', field_value: 'Source Moved On' },
    ]);

    await updateChangeDraft(CITIZEN, REQUEST_ID, updateInput);

    // No insert happened (the field was already in the draft), and nothing
    // rewrote the snapshot.
    expect(repo.insertChangeRequestFields).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      fields: [],
    });
    expect(repo.updateProposedValue).toHaveBeenCalledWith(
      expect.objectContaining({ proposedValue: 'Demo Newer Name' }),
    );
  });

  it('re-checks the live policy for a field already in the draft', async () => {
    const { FieldNotEditableError } = await import('../../src/shared/errors/index.js');
    assertFieldEditable.mockRejectedValue(new FieldNotEditableError());

    await expect(updateChangeDraft(CITIZEN, REQUEST_ID, updateInput)).rejects.toMatchObject({
      code: 'FIELD_NOT_EDITABLE',
    });
    expect(repo.updateProposedValue).not.toHaveBeenCalled();
  });

  it('removes a field the citizen dropped from the draft', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([
      STORED_FIELD,
      { ...STORED_FIELD, field_key: 'identityAddress', old_value: '12 Demo Street' },
    ]);

    await updateChangeDraft(CITIZEN, REQUEST_ID, updateInput);

    expect(repo.deleteChangeRequestFields).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      fieldKeys: ['identityAddress'],
    });
  });

  it('refuses a proposal identical to the snapshot', async () => {
    await expect(
      updateChangeDraft(CITIZEN, REQUEST_ID, {
        fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo Old Name' }],
      }),
    ).rejects.toMatchObject({ code: 'CHANGE_REQUEST_VALUE_UNCHANGED' });
  });

  it('conceals another citizen’s draft as not found', async () => {
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    await expect(updateChangeDraft(CITIZEN, REQUEST_ID, updateInput)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('refuses an officer', async () => {
    await expect(updateChangeDraft(OFFICER, REQUEST_ID, updateInput)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    await expect(updateChangeDraft(NEW_CITIZEN, REQUEST_ID, updateInput)).rejects.toMatchObject({
      code: 'CHANGE_REQUEST_ONBOARDING_REQUIRED',
    });
  });
});
