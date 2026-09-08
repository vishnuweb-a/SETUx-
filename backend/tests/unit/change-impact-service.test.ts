import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The impact engine's decisions
 * (Change & Correction Service, Phase 5).
 *
 * Five properties are pinned here, and each is something that would be silently
 * WRONG rather than loudly broken if it regressed:
 *
 * 1. **Deduplication is structural.** Two rules reaching one record produce ONE
 *    impact, never two cards for the same certificate.
 * 2. **The strongest level wins a merge.** Under-stating a consequence — telling
 *    a citizen a correction is optional when a rule calls it required — gives
 *    them the wrong basis for a decision, and it is the failure that a
 *    last-write-wins merge would produce silently.
 * 3. **Availability comes from the citizen's registry, never from a rule.** A
 *    rule cannot make a record exist.
 * 4. **Nothing is written.** Every repository here is mocked with read functions
 *    only, so a service that tried to create a target, move a status or touch a
 *    government record would fail as a missing function rather than pass.
 * 5. **Ordering is total and deterministic.** The same rules in a different
 *    order produce an identical response.
 */

vi.mock('../../src/modules/change-impact/change-impact.repository.js', () => ({
  listActiveDependencyRules: vi.fn(),
  listCitizenRecordsOfTypes: vi.fn(),
}));

vi.mock('../../src/modules/change-requests/change-request.repository.js', () => ({
  // READ-ONLY on purpose. There is no insert, update or delete to mock, so an
  // impact service that tried to persist anything would fail here.
  findChangeRequestForCitizen: vi.fn(),
  listFieldsForChangeRequest: vi.fn(),
}));

vi.mock('../../src/modules/citizen-records/citizen-record.repository.js', () => ({
  findRecordForCitizen: vi.fn(),
}));

const impactRepository = await import(
  '../../src/modules/change-impact/change-impact.repository.js'
);
const draftRepository = await import(
  '../../src/modules/change-requests/change-request.repository.js'
);
const recordRepository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const { getChangeImpact } = await import(
  '../../src/modules/change-impact/change-impact.service.js'
);
const { strongerImpactLevel } = await import(
  '../../src/modules/change-impact/change-impact.types.js'
);

const repo = {
  listActiveDependencyRules: vi.mocked(impactRepository.listActiveDependencyRules),
  listCitizenRecordsOfTypes: vi.mocked(impactRepository.listCitizenRecordsOfTypes),
  findChangeRequestForCitizen: vi.mocked(draftRepository.findChangeRequestForCitizen),
  listFieldsForChangeRequest: vi.mocked(draftRepository.listFieldsForChangeRequest),
  findRecordForCitizen: vi.mocked(recordRepository.findRecordForCitizen),
};

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';

const AUTH = {
  userId: CITIZEN_ID,
  email: 'citizen@setux.test',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const draftRow = {
  id: REQUEST_ID,
  request_number: 'CR-2026-000001',
  citizen_id: CITIZEN_ID,
  source_record_id: RECORD_ID,
  status: 'DRAFT',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

const identityRecord = {
  id: RECORD_ID,
  record_type: 'IDENTITY_RECORD',
  source_record_ref: 'SYNTH-IDR-2026-0117',
  status: 'ACTIVE',
  source_version: 'v1',
  last_synced_at: null,
  is_simulated: true,
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
  source: { code: 'MOCK_IDENTITY_API', name: 'Identity Registry (Mock)' },
  authority: { code: 'IDENTITY_AUTHORITY', name: 'Identity Authority' },
};

const nameField = {
  field_key: 'identityHolderName',
  old_value: 'Demo Old Name',
  proposed_value: 'Demo New Name',
  policy_snapshot: { editability: 'CONDITIONALLY_EDITABLE' },
  reason: null,
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

const addressField = {
  ...nameField,
  field_key: 'identityAddress',
  old_value: 'Old Address',
  proposed_value: 'New Address',
};

const rule = (
  sourceFieldKey: string,
  target: string,
  impact: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL',
  reason = `Because of ${sourceFieldKey}.`,
) => ({
  source_record_type: 'IDENTITY_RECORD',
  source_field_key: sourceFieldKey,
  target_record_type: target,
  target_field_key: 'someTargetField',
  impact_level: impact,
  reason,
  responsible_department: { code: 'REVENUE_DEPT', name: 'Revenue Department' },
});

beforeEach(() => {
  vi.resetAllMocks();
  repo.findChangeRequestForCitizen.mockResolvedValue(draftRow);
  repo.findRecordForCitizen.mockResolvedValue(identityRecord);
  repo.listFieldsForChangeRequest.mockResolvedValue([nameField]);
  repo.listActiveDependencyRules.mockResolvedValue([]);
  repo.listCitizenRecordsOfTypes.mockResolvedValue([]);
});

describe('strongerImpactLevel', () => {
  /**
   * The merge rule stated directly, because every deduplication assertion below
   * depends on it and a subtle change here would show up as a plausible-looking
   * badge rather than a failure.
   */
  it('keeps the stronger of two levels, whichever order they arrive in', () => {
    expect(strongerImpactLevel('OPTIONAL', 'REQUIRED')).toBe('REQUIRED');
    expect(strongerImpactLevel('REQUIRED', 'OPTIONAL')).toBe('REQUIRED');
    expect(strongerImpactLevel('RECOMMENDED', 'OPTIONAL')).toBe('RECOMMENDED');
    expect(strongerImpactLevel('OPTIONAL', 'RECOMMENDED')).toBe('RECOMMENDED');
    expect(strongerImpactLevel('REQUIRED', 'RECOMMENDED')).toBe('REQUIRED');
  });

  it('is idempotent', () => {
    expect(strongerImpactLevel('RECOMMENDED', 'RECOMMENDED')).toBe('RECOMMENDED');
  });
});

describe('getChangeImpact — the canonical name change', () => {
  it('returns the four expected targets at their expected levels', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
      rule('identityHolderName', 'EDUCATION_RECORD', 'RECOMMENDED'),
      rule('identityHolderName', 'COMMUNITY_RECORD', 'RECOMMENDED'),
      rule('identityHolderName', 'BANK_DETAILS', 'OPTIONAL'),
    ]);
    repo.listCitizenRecordsOfTypes.mockResolvedValue([
      { id: 'income-id', record_type: 'INCOME_RECORD' },
      { id: 'education-id', record_type: 'EDUCATION_RECORD' },
      { id: 'community-id', record_type: 'COMMUNITY_RECORD' },
      { id: 'bank-id', record_type: 'BANK_DETAILS' },
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(
      analysis.impacts.map((impact) => [impact.recordType, impact.impactLevel]),
    ).toStrictEqual([
      // Strongest first, then alphabetically by record type.
      ['INCOME_RECORD', 'REQUIRED'],
      ['COMMUNITY_RECORD', 'RECOMMENDED'],
      ['EDUCATION_RECORD', 'RECOMMENDED'],
      ['BANK_DETAILS', 'OPTIONAL'],
    ]);
  });

  it('echoes the changed field with the stored snapshot as its old value', async () => {
    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.changedFields).toStrictEqual([
      {
        fieldKey: 'identityHolderName',
        oldValue: 'Demo Old Name',
        proposedValue: 'Demo New Name',
      },
    ]);
  });

  it('names the source record and the request it analysed', async () => {
    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.changeRequestId).toBe(REQUEST_ID);
    expect(analysis.sourceRecord).toStrictEqual({
      recordId: RECORD_ID,
      recordType: 'IDENTITY_RECORD',
    });
  });
});

describe('getChangeImpact — deduplication and merging', () => {
  it('returns ONE impact per target record when two fields reach it', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([nameField, addressField]);
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
      rule('identityAddress', 'INCOME_RECORD', 'RECOMMENDED'),
    ]);
    repo.listCitizenRecordsOfTypes.mockResolvedValue([
      { id: 'income-id', record_type: 'INCOME_RECORD' },
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.impacts).toHaveLength(1);
    expect(analysis.impacts[0]?.recordType).toBe('INCOME_RECORD');
  });

  it('keeps the STRONGEST level when rules disagree', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([nameField, addressField]);
    repo.listActiveDependencyRules.mockResolvedValue([
      // The weaker rule arrives FIRST, so a last-write-wins merge would answer
      // REQUIRED by luck. The reverse order is asserted below.
      rule('identityAddress', 'INCOME_RECORD', 'OPTIONAL'),
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.impacts[0]?.impactLevel).toBe('REQUIRED');
  });

  it('keeps the strongest level whichever order the rules arrive in', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([nameField, addressField]);
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
      rule('identityAddress', 'INCOME_RECORD', 'OPTIONAL'),
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    // The same answer as the previous test, from the reversed input. This pair
    // is what "the merge is commutative" means in practice.
    expect(analysis.impacts[0]?.impactLevel).toBe('REQUIRED');
  });

  it('preserves every rule reason, strongest first', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([nameField, addressField]);
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityAddress', 'INCOME_RECORD', 'OPTIONAL', 'The address matters less.'),
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED', 'The name must match.'),
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.impacts[0]?.reasons).toStrictEqual([
      {
        fieldKey: 'identityHolderName',
        impactLevel: 'REQUIRED',
        reason: 'The name must match.',
      },
      {
        fieldKey: 'identityAddress',
        impactLevel: 'OPTIONAL',
        reason: 'The address matters less.',
      },
    ]);
  });
});

describe('getChangeImpact — target availability', () => {
  it('marks a target the citizen holds as available, with its record id', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
    ]);
    repo.listCitizenRecordsOfTypes.mockResolvedValue([
      { id: 'income-id', record_type: 'INCOME_RECORD' },
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.impacts[0]).toMatchObject({
      available: true,
      recordId: 'income-id',
    });
  });

  it('returns an unavailable target rather than dropping it', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'BANK_DETAILS', 'OPTIONAL'),
    ]);
    // The citizen holds no bank record.
    repo.listCitizenRecordsOfTypes.mockResolvedValue([]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    // Reported honestly, not hidden: "this change cannot reach your bank
    // details" is information the citizen needs.
    expect(analysis.impacts).toHaveLength(1);
    expect(analysis.impacts[0]).toMatchObject({
      recordType: 'BANK_DETAILS',
      available: false,
      recordId: null,
    });
  });

  it('resolves availability only from the CALLER’s registry', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
    ]);

    await getChangeImpact(AUTH, REQUEST_ID);

    // The one query that could leak another citizen's record ids is scoped by
    // the caller's own id, and this asserts the argument rather than trusting
    // the query.
    expect(repo.listCitizenRecordsOfTypes).toHaveBeenCalledWith({
      citizenId: CITIZEN_ID,
      recordTypes: ['INCOME_RECORD'],
    });
  });
});

describe('getChangeImpact — empty and unsupported cases', () => {
  it('returns an empty impact list when no rule matches the changed field', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    // A 200 with nothing affected, not a 404. "Nothing else is affected" is an
    // answer, not a missing resource.
    expect(analysis.impacts).toStrictEqual([]);
    expect(analysis.changedFields).toHaveLength(1);
  });

  it('handles a draft with no fields without failing', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    expect(analysis.changedFields).toStrictEqual([]);
    expect(analysis.impacts).toStrictEqual([]);
  });

  it('drops a rule naming an unsupported target rather than failing the request', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
      rule('identityHolderName', 'NOT_A_RECORD_TYPE', 'REQUIRED'),
    ]);
    repo.listCitizenRecordsOfTypes.mockResolvedValue([
      { id: 'income-id', record_type: 'INCOME_RECORD' },
    ]);

    const analysis = await getChangeImpact(AUTH, REQUEST_ID);

    // The four correct impacts are not denied because of one bad rule.
    expect(analysis.impacts.map((impact) => impact.recordType)).toStrictEqual([
      'INCOME_RECORD',
    ]);
  });
});

describe('getChangeImpact — ownership and access', () => {
  it('reads the draft scoped to the caller', async () => {
    await getChangeImpact(AUTH, REQUEST_ID);

    expect(repo.findChangeRequestForCitizen).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('is a not-found error when the draft is not the caller’s', async () => {
    // The repository scopes by owner, so another citizen's draft comes back
    // null and is indistinguishable from an id that never existed.
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    await expect(getChangeImpact(AUTH, REQUEST_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses an officer', async () => {
    await expect(
      getChangeImpact({ ...AUTH, role: 'GOVERNMENT_OFFICER' }, REQUEST_ID),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Refused at the door: no draft was even looked up.
    expect(repo.findChangeRequestForCitizen).not.toHaveBeenCalled();
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    await expect(
      getChangeImpact({ ...AUTH, onboardingStatus: 'NOT_STARTED' }, REQUEST_ID),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'CHANGE_REQUEST_ONBOARDING_REQUIRED',
    });
  });
});

describe('getChangeImpact — immutability', () => {
  it('never writes: no repository mocked here has a write function', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([
      rule('identityHolderName', 'INCOME_RECORD', 'REQUIRED'),
    ]);

    await getChangeImpact(AUTH, REQUEST_ID);

    // The mocked modules expose ONLY the read functions the service is allowed
    // to use. A call to any write path would have thrown "not a function"
    // above, so reaching this assertion is itself the proof.
    expect(Object.keys(draftRepository)).toStrictEqual([
      'findChangeRequestForCitizen',
      'listFieldsForChangeRequest',
    ]);
    expect(Object.keys(recordRepository)).toStrictEqual(['findRecordForCitizen']);
    expect(Object.keys(impactRepository)).toStrictEqual([
      'listActiveDependencyRules',
      'listCitizenRecordsOfTypes',
    ]);
  });

  it('reads the draft’s fields rather than any field list from the caller', async () => {
    repo.listFieldsForChangeRequest.mockResolvedValue([nameField, addressField]);

    await getChangeImpact(AUTH, REQUEST_ID);

    // The rule lookup's source fields come from the STORED draft. There is no
    // parameter on `getChangeImpact` through which a caller could name a field.
    expect(repo.listActiveDependencyRules).toHaveBeenCalledWith({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityHolderName', 'identityAddress'],
    });
  });
});
