import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FieldPolicyModule from '../../src/modules/field-policies/index.js';

/**
 * The citizen record service's decisions
 * (Change & Correction Service, Phase 2).
 *
 * Three properties are pinned here, and each one is a thing that would be
 * silently wrong rather than loudly broken if it regressed:
 *
 * 1. **The citizen comes from the token, never from an argument.** Every
 *    repository call must carry `auth.userId` and nothing else. A service that
 *    accepted a citizen id would put the whole registry one forged parameter
 *    away from a cross-citizen read.
 * 2. **Editability is read from the policy table, never defaulted.** A field
 *    with no active policy is NOT changeable. The safety of the feature must
 *    not depend on the completeness of a seed.
 * 3. **A record belonging to another citizen is NOT FOUND**, not forbidden —
 *    the two answers must be indistinguishable.
 */

vi.mock('../../src/modules/citizen-records/citizen-record.repository.js', () => ({
  listRecordsByCitizen: vi.fn(),
  findRecordForCitizen: vi.fn(),
  listFieldsForCitizenRecord: vi.fn(),
}));

vi.mock('../../src/modules/field-policies/index.js', async () => {
  const actual =
    await vi.importActual<typeof FieldPolicyModule>('../../src/modules/field-policies/index.js');
  return { ...actual, listActiveFieldPolicies: vi.fn() };
});

const repository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const policies = await import('../../src/modules/field-policies/index.js');
const { getCitizenRecord, listCitizenRecords } = await import(
  '../../src/modules/citizen-records/citizen-record.service.js'
);

const repo = {
  listRecordsByCitizen: vi.mocked(repository.listRecordsByCitizen),
  findRecordForCitizen: vi.mocked(repository.findRecordForCitizen),
  listFieldsForCitizenRecord: vi.mocked(repository.listFieldsForCitizenRecord),
};
const listActiveFieldPolicies = vi.mocked(policies.listActiveFieldPolicies);

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';

const CITIZEN = {
  userId: CITIZEN_ID,
  email: 'citizen@setux.test',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const IDENTITY_ROW = {
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

const HOLDER_POLICY = {
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
  dependencyGroup: 'LEGAL_NAME',
} as const;

const REFERENCE_POLICY = {
  fieldKey: 'identityRegistryReference',
  editability: 'IMMUTABLE',
  requiresEvidence: false,
  requiresReview: false,
  authority: 'Identity Authority',
  dependencyGroup: null,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  repo.listRecordsByCitizen.mockResolvedValue([]);
  repo.findRecordForCitizen.mockResolvedValue(IDENTITY_ROW);
  repo.listFieldsForCitizenRecord.mockResolvedValue([]);
  listActiveFieldPolicies.mockResolvedValue([HOLDER_POLICY, REFERENCE_POLICY]);
});

describe('listCitizenRecords', () => {
  it('asks the repository only for the authenticated citizen', async () => {
    await listCitizenRecords(CITIZEN);

    expect(repo.listRecordsByCitizen).toHaveBeenCalledWith(CITIZEN_ID);
  });

  it('returns an empty inventory rather than raising', async () => {
    // A citizen SetuX has not provisioned records for genuinely has none, and
    // the UI has an empty state for exactly that.
    const payload = await listCitizenRecords(CITIZEN);

    expect(payload).toEqual({ items: [], total: 0 });
  });

  it('omits the internal routing UUIDs from the response', async () => {
    repo.listRecordsByCitizen.mockResolvedValue([IDENTITY_ROW]);

    const { items } = await listCitizenRecords(CITIZEN);

    expect(items[0]).not.toHaveProperty('citizen_id');
    expect(items[0]).not.toHaveProperty('data_source_id');
    expect(items[0]).not.toHaveProperty('authority_department_id');
  });

  it('refuses an officer', async () => {
    await expect(
      listCitizenRecords({ ...CITIZEN, role: 'GOVERNMENT_OFFICER' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(repo.listRecordsByCitizen).not.toHaveBeenCalled();
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    await expect(
      listCitizenRecords({ ...CITIZEN, onboardingStatus: 'NOT_STARTED' }),
    ).rejects.toMatchObject({ code: 'CITIZEN_RECORD_ONBOARDING_REQUIRED' });

    expect(repo.listRecordsByCitizen).not.toHaveBeenCalled();
  });
});

describe('getCitizenRecord', () => {
  it('scopes the lookup to the authenticated citizen', async () => {
    await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(repo.findRecordForCitizen).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('never passes a caller-supplied citizen id to the repository', async () => {
    // There is no parameter through which one could be supplied — this asserts
    // the identity used is the token's, not anything derived from the request.
    await getCitizenRecord(CITIZEN, RECORD_ID);

    const call = repo.findRecordForCitizen.mock.calls[0]?.[0];
    expect(call?.citizenId).toBe(CITIZEN_ID);
    expect(call?.citizenId).not.toBe(OTHER_CITIZEN_ID);
  });

  it("answers 404 for a record the citizen does not own", async () => {
    // Indistinguishable from an id that never existed: the repository returns
    // null in both cases, and the service must not tell them apart either.
    repo.findRecordForCitizen.mockResolvedValue(null);

    await expect(getCitizenRecord(CITIZEN, RECORD_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('enriches each field with the policy governing it', async () => {
    repo.listFieldsForCitizenRecord.mockResolvedValue([
      {
        field_key: 'identityHolderName',
        field_value: 'Demo Old Name',
        retrieved_at: '2026-09-08T00:00:00.000Z',
      },
    ]);

    const record = await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(record.fields[0]).toEqual({
      fieldKey: 'identityHolderName',
      value: 'Demo Old Name',
      retrievedAt: '2026-09-08T00:00:00.000Z',
      editability: 'CONDITIONALLY_EDITABLE',
      changeable: true,
      requiresEvidence: true,
      requiresReview: true,
      policyAuthority: 'Identity Authority',
    });
  });

  it('marks an IMMUTABLE field as not changeable', async () => {
    repo.listFieldsForCitizenRecord.mockResolvedValue([
      {
        field_key: 'identityRegistryReference',
        field_value: 'SYNTH-IDR-2026-0117',
        retrieved_at: '2026-09-08T00:00:00.000Z',
      },
    ]);

    const record = await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(record.fields[0]?.editability).toBe('IMMUTABLE');
    expect(record.fields[0]?.changeable).toBe(false);
  });

  it('treats an ungoverned field as NOT changeable', async () => {
    // A field SetuX has no policy for must never become correctable by having
    // been forgotten. This is the permissive-default trap, asserted closed.
    repo.listFieldsForCitizenRecord.mockResolvedValue([
      {
        field_key: 'identitySomethingUnseeded',
        field_value: 'x',
        retrieved_at: '2026-09-08T00:00:00.000Z',
      },
    ]);

    const record = await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(record.fields[0]?.editability).toBeNull();
    expect(record.fields[0]?.changeable).toBe(false);
    expect(record.fields[0]?.requiresEvidence).toBe(false);
    expect(record.fields[0]?.requiresReview).toBe(false);
  });

  it('reads the policy for the record type once, not once per field', async () => {
    repo.listFieldsForCitizenRecord.mockResolvedValue([
      { field_key: 'identityHolderName', field_value: 'a', retrieved_at: 'x' },
      { field_key: 'identityRegistryReference', field_value: 'b', retrieved_at: 'x' },
    ]);

    await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(listActiveFieldPolicies).toHaveBeenCalledTimes(1);
    expect(listActiveFieldPolicies).toHaveBeenCalledWith('IDENTITY_RECORD');
  });

  it('re-asserts ownership when reading the fields', async () => {
    await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(repo.listFieldsForCitizenRecord).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('carries a null authority for a provider-held record', async () => {
    repo.findRecordForCitizen.mockResolvedValue({
      ...IDENTITY_ROW,
      record_type: 'BANK_DETAILS',
      authority: null,
    });
    listActiveFieldPolicies.mockResolvedValue([]);

    const record = await getCitizenRecord(CITIZEN, RECORD_ID);

    expect(record.authority).toBeNull();
    expect(record.recordType).toBe('BANK_DETAILS');
  });

  it('refuses a stored record type the API has no vocabulary for', async () => {
    // A configuration fault, made loud rather than answered with a record type
    // the client's own enum does not contain.
    repo.findRecordForCitizen.mockResolvedValue({
      ...IDENTITY_ROW,
      record_type: 'SOME_FUTURE_RECORD',
    });

    await expect(getCitizenRecord(CITIZEN, RECORD_ID)).rejects.toMatchObject({
      code: 'CITIZEN_RECORD_UNSUPPORTED_TYPE',
    });
  });

  it('refuses an officer before touching the repository', async () => {
    await expect(
      getCitizenRecord({ ...CITIZEN, role: 'GOVERNMENT_OFFICER' }, RECORD_ID),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });
});

describe('the service as a whole', () => {
  it('exports no mutation of any kind', async () => {
    const service = await import(
      '../../src/modules/citizen-records/citizen-record.service.js'
    );

    const writeNames = Object.keys(service).filter((name) =>
      /create|update|submit|delete|remove|save|propose|change/i.test(name),
    );

    expect(writeNames).toEqual([]);
  });
});
