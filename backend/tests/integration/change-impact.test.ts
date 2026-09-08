import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 5 impact detection contract, exercised against the real middleware
 * chain and the real controller and service layers
 * (Change & Correction Service).
 *
 * Only the edges are stubbed: the Supabase Auth server and the three
 * repositories. Everything between them — `requireAuth`, `requireRole`,
 * `validateRequest`, the route, the controller, the service, the error handler
 * — is the code under test.
 *
 * TWO THINGS THIS FILE ESTABLISHES, beyond that the endpoint returns the right
 * shape.
 *
 * 1. **The endpoint is READ-ONLY at the HTTP boundary too.** Every mutating
 *    verb against it is refused by the router, and no write function exists on
 *    any mocked repository — so a handler that tried to create a target or move
 *    a status would fail rather than pass.
 *
 * 2. **There is no path through which a client can supply an impact.** The
 *    request has no body and no accepted query parameter, so a caller cannot
 *    name a source type, a field, a target, a level or a reason. The assertions
 *    below verify the refusals rather than assuming the schema is applied.
 */

const getUser = vi.fn();

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({ auth: { getUser } }),
    createIsolatedAuthClient: () => ({ auth: { getUser } }),
  };
});

vi.mock('../../src/modules/auth/auth.repository.js', () => ({
  findProfileById: vi.fn(),
  insertProfile: vi.fn(),
}));

vi.mock('../../src/modules/citizen-records/citizen-record.repository.js', () => ({
  listRecordsByCitizen: vi.fn(),
  findRecordForCitizen: vi.fn(),
  listFieldsForCitizenRecord: vi.fn(),
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

vi.mock('../../src/modules/change-impact/change-impact.repository.js', () => ({
  // READ-ONLY. There is no write function to mock, deliberately.
  listActiveDependencyRules: vi.fn(),
  listCitizenRecordsOfTypes: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const recordRepository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const draftRepository = await import(
  '../../src/modules/change-requests/change-request.repository.js'
);
const impactRepository = await import(
  '../../src/modules/change-impact/change-impact.repository.js'
);
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  findRecordForCitizen: vi.mocked(recordRepository.findRecordForCitizen),
  findChangeRequestForCitizen: vi.mocked(draftRepository.findChangeRequestForCitizen),
  listFieldsForChangeRequest: vi.mocked(draftRepository.listFieldsForChangeRequest),
  listActiveDependencyRules: vi.mocked(impactRepository.listActiveDependencyRules),
  listCitizenRecordsOfTypes: vi.mocked(impactRepository.listCitizenRecordsOfTypes),
  // Phase 4 write paths, asserted below to remain untouched by an impact read.
  insertChangeRequest: vi.mocked(draftRepository.insertChangeRequest),
  insertChangeRequestFields: vi.mocked(draftRepository.insertChangeRequestFields),
  updateProposedValue: vi.mocked(draftRepository.updateProposedValue),
  deleteChangeRequestFields: vi.mocked(draftRepository.deleteChangeRequestFields),
  deleteChangeRequest: vi.mocked(draftRepository.deleteChangeRequest),
  touchChangeRequest: vi.mocked(draftRepository.touchChangeRequest),
};

const app = createApp();

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';

const CITIZEN = {
  id: CITIZEN_ID,
  email: 'citizen@setux.test',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const OFFICER = {
  id: '66666666-6666-4666-8666-666666666666',
  email: 'officer@setux.test',
  role: 'GOVERNMENT_OFFICER',
  onboardingStatus: 'COMPLETED',
} as const;

const NEW_CITIZEN = { ...CITIZEN, onboardingStatus: 'NOT_STARTED' } as const;

const identityRow = {
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

const requestRow = {
  id: REQUEST_ID,
  request_number: 'CR-2026-000001',
  citizen_id: CITIZEN_ID,
  source_record_id: RECORD_ID,
  status: 'DRAFT',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

const storedField = {
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

/** The four canonical rules of arch §23, as the repository returns them. */
const CANONICAL_RULES = [
  {
    source_record_type: 'IDENTITY_RECORD',
    source_field_key: 'identityHolderName',
    target_record_type: 'INCOME_RECORD',
    target_field_key: 'incomeCertificateHolder',
    impact_level: 'REQUIRED' as const,
    reason: 'Your income certificate is issued in the same name.',
    responsible_department: { code: 'REVENUE_DEPT', name: 'Revenue Department' },
  },
  {
    source_record_type: 'IDENTITY_RECORD',
    source_field_key: 'identityHolderName',
    target_record_type: 'EDUCATION_RECORD',
    target_field_key: 'educationStudentName',
    impact_level: 'RECOMMENDED' as const,
    reason: 'Your education record shows the same name.',
    responsible_department: { code: 'HIGHER_ED', name: 'Higher Education' },
  },
  {
    source_record_type: 'IDENTITY_RECORD',
    source_field_key: 'identityHolderName',
    target_record_type: 'COMMUNITY_RECORD',
    target_field_key: 'communityCertificateHolder',
    impact_level: 'RECOMMENDED' as const,
    reason: 'Your community certificate is issued in the same name.',
    responsible_department: { code: 'MINORITY_AFFAIRS', name: 'Minority Affairs' },
  },
  {
    source_record_type: 'IDENTITY_RECORD',
    source_field_key: 'identityHolderName',
    target_record_type: 'BANK_DETAILS',
    target_field_key: 'bankAccountHolder',
    impact_level: 'OPTIONAL' as const,
    reason: 'Your bank account is held in the same name.',
    // No department: the bank is a provider (arch §8.1).
    responsible_department: null,
  },
];

const ALL_TARGETS = [
  { id: 'income-record-id', record_type: 'INCOME_RECORD' },
  { id: 'education-record-id', record_type: 'EDUCATION_RECORD' },
  { id: 'community-record-id', record_type: 'COMMUNITY_RECORD' },
  { id: 'bank-record-id', record_type: 'BANK_DETAILS' },
];

const signInAs = (user: {
  id: string;
  email: string;
  role: 'CITIZEN' | 'GOVERNMENT_OFFICER';
  onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}) => {
  getUser.mockResolvedValue({ data: { user: { id: user.id, email: user.email } }, error: null });
  findProfileByIdMock.mockResolvedValue({
    id: user.id,
    email: user.email,
    role: user.role,
    onboardingStatus: user.onboardingStatus,
  });
};

const IMPACT_PATH = `/api/v1/change-requests/drafts/${REQUEST_ID}/impact`;

const get = (path: string) => request(app).get(path).set('Authorization', 'Bearer valid-token');

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(CITIZEN);
  repo.findChangeRequestForCitizen.mockResolvedValue(requestRow);
  repo.findRecordForCitizen.mockResolvedValue(identityRow);
  repo.listFieldsForChangeRequest.mockResolvedValue([storedField]);
  repo.listActiveDependencyRules.mockResolvedValue(CANONICAL_RULES);
  repo.listCitizenRecordsOfTypes.mockResolvedValue(ALL_TARGETS);
});

describe('GET /api/v1/change-requests/drafts/:id/impact — the canonical scenario', () => {
  it('returns 200 with the four expected targets at their expected levels', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    expect(response.body.success).toBe(true);
    expect(
      response.body.data.impacts.map(
        (impact: { recordType: string; impactLevel: string }) => [
          impact.recordType,
          impact.impactLevel,
        ],
      ),
    ).toStrictEqual([
      ['INCOME_RECORD', 'REQUIRED'],
      ['COMMUNITY_RECORD', 'RECOMMENDED'],
      ['EDUCATION_RECORD', 'RECOMMENDED'],
      ['BANK_DETAILS', 'OPTIONAL'],
    ]);
  });

  it('returns exactly one card per target record', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    const types = response.body.data.impacts.map(
      (impact: { recordType: string }) => impact.recordType,
    );

    expect(types).toHaveLength(new Set(types).size);
  });

  it('echoes the change being analysed, with the stored snapshot', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    expect(response.body.data.changedFields).toStrictEqual([
      {
        fieldKey: 'identityHolderName',
        oldValue: 'Demo Old Name',
        proposedValue: 'Demo New Name',
      },
    ]);
  });

  it('names the responsible department, and null for the provider', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    const byType = new Map(
      response.body.data.impacts.map(
        (impact: { recordType: string }) => [impact.recordType, impact] as const,
      ),
    );

    expect(byType.get('INCOME_RECORD')).toMatchObject({
      responsibleDepartment: { code: 'REVENUE_DEPT', name: 'Revenue Department' },
    });
    // The bank has no officer queue, and the response says so honestly.
    expect(byType.get('BANK_DETAILS')).toMatchObject({ responsibleDepartment: null });
  });

  it('carries a citizen-facing reason on every impact', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    for (const impact of response.body.data.impacts) {
      expect(impact.reasons.length).toBeGreaterThan(0);
      expect(impact.reasons[0].reason).toEqual(expect.any(String));
      expect(impact.reasons[0].reason.length).toBeGreaterThan(0);
    }
  });
});

describe('GET impact — rule selection', () => {
  it('asks only for ACTIVE rules of the draft’s own record type and fields', async () => {
    await get(IMPACT_PATH).expect(200);

    // `active` is the repository's predicate, so an inactive rule is never
    // returned to the service — this asserts the service asks the right
    // question, and the database test asserts the predicate itself.
    expect(repo.listActiveDependencyRules).toHaveBeenCalledWith({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityHolderName'],
    });
  });

  it('returns an empty impact list when no rule matches', async () => {
    repo.listActiveDependencyRules.mockResolvedValue([]);

    const response = await get(IMPACT_PATH).expect(200);

    // 200, not 404: "nothing else is affected" is an answer.
    expect(response.body.data.impacts).toStrictEqual([]);
  });

  it('represents an unavailable target rather than hiding it', async () => {
    // The citizen holds no bank record.
    repo.listCitizenRecordsOfTypes.mockResolvedValue(
      ALL_TARGETS.filter((record) => record.record_type !== 'BANK_DETAILS'),
    );

    const response = await get(IMPACT_PATH).expect(200);

    const bank = response.body.data.impacts.find(
      (impact: { recordType: string }) => impact.recordType === 'BANK_DETAILS',
    );

    expect(bank).toMatchObject({ available: false, recordId: null });
  });
});

describe('GET impact — authorization', () => {
  it('rejects an anonymous caller', async () => {
    await request(app).get(IMPACT_PATH).expect(401);

    expect(repo.findChangeRequestForCitizen).not.toHaveBeenCalled();
  });

  it('rejects an officer', async () => {
    signInAs(OFFICER);

    await get(IMPACT_PATH).expect(403);

    // Refused at the door: no draft was looked up, so nothing about its
    // existence leaked.
    expect(repo.findChangeRequestForCitizen).not.toHaveBeenCalled();
  });

  it('rejects a citizen who has not completed onboarding', async () => {
    signInAs(NEW_CITIZEN);

    const response = await get(IMPACT_PATH).expect(403);

    expect(response.body.error.code).toBe('CHANGE_REQUEST_ONBOARDING_REQUIRED');
  });

  it('conceals another citizen’s draft as a 404', async () => {
    // The repository scopes by owner, so a draft that is not the caller's comes
    // back null — the same answer as an id that never existed.
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    const response = await get(IMPACT_PATH).expect(404);

    // The message must not hint that the draft exists but belongs to somebody
    // else.
    expect(JSON.stringify(response.body)).not.toMatch(/another|other citizen|forbidden/i);
  });

  it('scopes the draft lookup to the authenticated caller', async () => {
    await get(IMPACT_PATH).expect(200);

    expect(repo.findChangeRequestForCitizen).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('resolves target availability only from the caller’s own registry', async () => {
    await get(IMPACT_PATH).expect(200);

    expect(repo.listCitizenRecordsOfTypes).toHaveBeenCalledWith({
      citizenId: CITIZEN_ID,
      recordTypes: expect.any(Array),
    });
    expect(repo.listCitizenRecordsOfTypes.mock.calls[0]?.[0].citizenId).toBe(CITIZEN_ID);
  });
});

describe('GET impact — input validation', () => {
  it('rejects a malformed change request id with 400', async () => {
    const response = await get('/api/v1/change-requests/drafts/not-a-uuid/impact').expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    // Refused at the edge, before any query ran.
    expect(repo.findChangeRequestForCitizen).not.toHaveBeenCalled();
  });

  it('rejects an unexpected query parameter', async () => {
    // `?citizenId=…` must be a visible error, not a parameter someone believes
    // worked.
    await get(`${IMPACT_PATH}?citizenId=${CITIZEN_ID}`).expect(400);
  });
});

describe('GET impact — the endpoint mutates nothing', () => {
  it('calls no write function on any repository', async () => {
    await get(IMPACT_PATH).expect(200);

    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
    expect(repo.insertChangeRequestFields).not.toHaveBeenCalled();
    expect(repo.updateProposedValue).not.toHaveBeenCalled();
    expect(repo.deleteChangeRequestFields).not.toHaveBeenCalled();
    expect(repo.deleteChangeRequest).not.toHaveBeenCalled();
    // Not even the parent's `updated_at`: reading a draft's consequences is not
    // working on the draft.
    expect(repo.touchChangeRequest).not.toHaveBeenCalled();
  });

  it('refuses every mutating verb on the impact path', async () => {
    const token = 'Bearer valid-token';

    // 404 (no such route) or 405 — either is a refusal. What must not happen is
    // a 2xx, which would mean a write verb reached a handler.
    for (const send of [
      request(app).post(IMPACT_PATH).set('Authorization', token).send({}),
      request(app).patch(IMPACT_PATH).set('Authorization', token).send({}),
      request(app).put(IMPACT_PATH).set('Authorization', token).send({}),
      request(app).delete(IMPACT_PATH).set('Authorization', token),
    ]) {
      const response = await send;
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('leaves the draft in DRAFT', async () => {
    await get(IMPACT_PATH).expect(200);

    // The row the service read is the row it read. Nothing in the response
    // carries a status, and nothing wrote one.
    expect(requestRow.status).toBe('DRAFT');
    expect(repo.touchChangeRequest).not.toHaveBeenCalled();
  });

  it('exposes no status, target, consent or selection in the response', async () => {
    const response = await get(IMPACT_PATH).expect(200);

    const body = JSON.stringify(response.body);

    // Phase 6+ vocabulary must not appear. A field the UI could bind a checkbox
    // to would be a promise the backend does not keep.
    expect(body).not.toMatch(/"selected"|"consent"|"targetId"|"status"/);
  });
});
