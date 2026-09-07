import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 2 citizen record registry contract, exercised against the real
 * middleware chain and the real controller and service layers
 * (Change & Correction Service).
 *
 * Only the two edges are stubbed: the Supabase Auth server and the two
 * repositories. Everything between them — `requireAuth`, `requireRole`,
 * `validateRequest`, the controller, the service, the error handler — is the
 * code under test.
 *
 * The security assertions at the end are the point of the phase. They establish
 * that the API has no path through which a client can name a citizen other than
 * itself, and no path through which it can write a government record at all.
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

vi.mock('../../src/modules/field-policies/field-policy.repository.js', () => ({
  listActiveFieldPolicies: vi.fn(),
  findActiveFieldPolicy: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const recordRepository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const policyRepository = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  listRecordsByCitizen: vi.mocked(recordRepository.listRecordsByCitizen),
  findRecordForCitizen: vi.mocked(recordRepository.findRecordForCitizen),
  listFieldsForCitizenRecord: vi.mocked(recordRepository.listFieldsForCitizenRecord),
  listActiveFieldPolicies: vi.mocked(policyRepository.listActiveFieldPolicies),
};

const app = createApp();

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';

const CITIZEN = {
  id: CITIZEN_ID,
  email: 'citizen@setux.test',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const OFFICER = {
  id: '44444444-4444-4444-8444-444444444444',
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

const bankRow = {
  ...identityRow,
  id: '55555555-5555-4555-8555-555555555555',
  record_type: 'BANK_DETAILS',
  source_record_ref: 'SYNTH-BNK-2026-004409',
  source: { code: 'MOCK_BANK_API', name: 'Demo Public Bank (Simulated)' },
  authority: null,
};

const HOLDER_POLICY = {
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
  dependencyGroup: 'LEGAL_NAME',
} as const;

/** Signs the request in as the given user by making the token resolve to them. */
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

const authorized = (path: string) =>
  request(app).get(path).set('Authorization', 'Bearer valid-token');

const BASE = '/api/v1/citizen-records';

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(CITIZEN);
  repo.listRecordsByCitizen.mockResolvedValue([identityRow, bankRow]);
  repo.findRecordForCitizen.mockResolvedValue(identityRow);
  repo.listFieldsForCitizenRecord.mockResolvedValue([
    {
      field_key: 'identityHolderName',
      field_value: 'Demo Old Name',
      retrieved_at: '2026-09-08T00:00:00.000Z',
    },
  ]);
  repo.listActiveFieldPolicies.mockResolvedValue([HOLDER_POLICY]);
});

describe('GET /api/v1/citizen-records', () => {
  it("returns the citizen's own record inventory", async () => {
    const response = await authorized(BASE);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.total).toBe(2);
    expect(response.body.data.items.map((i: { recordType: string }) => i.recordType)).toEqual([
      'IDENTITY_RECORD',
      'BANK_DETAILS',
    ]);
  });

  it('reads the inventory for the token holder alone', async () => {
    await authorized(BASE);

    expect(repo.listRecordsByCitizen).toHaveBeenCalledWith(CITIZEN_ID);
    expect(repo.listRecordsByCitizen).not.toHaveBeenCalledWith(OTHER_CITIZEN_ID);
  });

  it('rejects a forged citizenId on the collection rather than ignoring it', async () => {
    const response = await authorized(`${BASE}?citizenId=${OTHER_CITIZEN_ID}`);

    expect(response.status).toBe(400);
    expect(repo.listRecordsByCitizen).not.toHaveBeenCalled();
  });

  it('names the source and the authority rather than exposing routing UUIDs', async () => {
    const response = await authorized(BASE);
    const [identity] = response.body.data.items;

    expect(identity.source).toEqual({
      code: 'MOCK_IDENTITY_API',
      name: 'Identity Registry (Mock)',
    });
    expect(identity.authority).toEqual({
      code: 'IDENTITY_AUTHORITY',
      name: 'Identity Authority',
    });
    expect(identity).not.toHaveProperty('citizenId');
    expect(identity).not.toHaveProperty('dataSourceId');
    expect(identity).not.toHaveProperty('authorityDepartmentId');
  });

  it('reports a null authority for the provider-held bank record', async () => {
    // The bank is a provider, not a department: it has no officer queue, and
    // the API says so rather than inventing an authority (arch §20.6).
    const response = await authorized(BASE);
    const bank = response.body.data.items[1];

    expect(bank.recordType).toBe('BANK_DETAILS');
    expect(bank.authority).toBeNull();
    expect(bank.source.code).toBe('MOCK_BANK_API');
  });

  it('marks every prototype record as simulated', async () => {
    const response = await authorized(BASE);

    for (const item of response.body.data.items) {
      expect(item.isSimulated).toBe(true);
    }
  });

  it('returns an empty inventory rather than an error', async () => {
    repo.listRecordsByCitizen.mockResolvedValue([]);

    const response = await authorized(BASE);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], total: 0 });
  });
});

describe('GET /api/v1/citizen-records/:recordId', () => {
  it('returns the record with its current values and their policies', async () => {
    const response = await authorized(`${BASE}/${RECORD_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(RECORD_ID);
    expect(response.body.data.sourceRecordRef).toBe('SYNTH-IDR-2026-0117');
    expect(response.body.data.fields).toEqual([
      {
        fieldKey: 'identityHolderName',
        value: 'Demo Old Name',
        retrievedAt: '2026-09-08T00:00:00.000Z',
        editability: 'CONDITIONALLY_EDITABLE',
        changeable: true,
        requiresEvidence: true,
        requiresReview: true,
        policyAuthority: 'Identity Authority',
      },
    ]);
  });

  it('marks a field with no active policy as not changeable', async () => {
    repo.listActiveFieldPolicies.mockResolvedValue([]);

    const response = await authorized(`${BASE}/${RECORD_ID}`);

    expect(response.body.data.fields[0].editability).toBeNull();
    expect(response.body.data.fields[0].changeable).toBe(false);
  });

  it('answers 400 for a malformed record id, before any query runs', async () => {
    const response = await authorized(`${BASE}/not-a-uuid`);

    expect(response.status).toBe(400);
    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });

  it('answers 404 for a well-formed id that matches nothing', async () => {
    repo.findRecordForCitizen.mockResolvedValue(null);

    const response = await authorized(`${BASE}/${RECORD_ID}`);

    expect(response.status).toBe(404);
  });

  it('conceals a record belonging to another citizen behind the same 404', async () => {
    // The repository is scoped by owner, so another citizen's record returns
    // null exactly as a non-existent id does — and the API must not distinguish
    // them in status, code or message.
    repo.findRecordForCitizen.mockResolvedValue(null);
    const foreign = await authorized(`${BASE}/${RECORD_ID}`);

    repo.findRecordForCitizen.mockResolvedValue(null);
    const missing = await authorized(`${BASE}/99999999-9999-4999-8999-999999999999`);

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body.error.code).toBe(missing.body.error.code);
    expect(foreign.body.error.message).toBe(missing.body.error.message);
  });

  it('scopes both the record and the field lookup to the token holder', async () => {
    await authorized(`${BASE}/${RECORD_ID}`);

    expect(repo.findRecordForCitizen).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });
    expect(repo.listFieldsForCitizenRecord).toHaveBeenCalledWith({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });
  });
});

describe('authentication and role', () => {
  it.each([BASE, `${BASE}/${RECORD_ID}`])('refuses an anonymous request to %s', async (path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(repo.listRecordsByCitizen).not.toHaveBeenCalled();
    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });

  it('refuses an invalid token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });

    const response = await authorized(BASE);

    expect(response.status).toBe(401);
  });

  it.each([BASE, `${BASE}/${RECORD_ID}`])('refuses an officer at %s', async (path) => {
    // An officer's authority over a citizen record comes from a change target
    // (arch §4.6), which does not exist yet. Until it does, officers get
    // nothing here — matching the table's own absent officer RLS policy.
    signInAs(OFFICER);

    const response = await authorized(path);

    expect(response.status).toBe(403);
    expect(repo.listRecordsByCitizen).not.toHaveBeenCalled();
    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    signInAs(NEW_CITIZEN);

    const response = await authorized(BASE);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CITIZEN_RECORD_ONBOARDING_REQUIRED');
  });
});

describe('security', () => {
  it('rejects a forged citizenId query parameter rather than honouring it', async () => {
    // `.strict()` means an unknown parameter is a visible 400, not a silently
    // dropped no-op that leaves a caller unsure whether it was applied.
    const response = await authorized(`${BASE}/${RECORD_ID}?citizenId=${OTHER_CITIZEN_ID}`);

    expect(response.status).toBe(400);
    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });

  it('ignores a forged citizen id in the body of a read', async () => {
    const response = await request(app)
      .get(BASE)
      .set('Authorization', 'Bearer valid-token')
      .send({ citizenId: OTHER_CITIZEN_ID });

    expect(response.status).toBe(200);
    expect(repo.listRecordsByCitizen).toHaveBeenCalledWith(CITIZEN_ID);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'exposes no %s route on the collection',
    async (method) => {
      const response = await request(app)[method](BASE)
        .set('Authorization', 'Bearer valid-token')
        .send({ recordType: 'IDENTITY_RECORD' });

      expect(response.status).toBe(404);
    },
  );

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'exposes no %s route on a single record',
    async (method) => {
      const response = await request(app)[method](`${BASE}/${RECORD_ID}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ fields: { identityHolderName: 'Demo New Name' } });

      expect(response.status).toBe(404);
    },
  );

  it('has no endpoint that accepts a proposed value', async () => {
    // Phase 2 builds the inventory; the correction is Phase 3 and later. A
    // proposed value has nowhere to land in this phase.
    const response = await request(app)
      .patch(`${BASE}/${RECORD_ID}/fields/identityHolderName`)
      .set('Authorization', 'Bearer valid-token')
      .send({ proposedValue: 'Demo New Name' });

    expect(response.status).toBe(404);
  });

  it('reports a repository failure as a generic INTERNAL_ERROR with no stack', async () => {
    // The error handler reports `String(err)` outside production, deliberately,
    // so a developer can see what broke; in production the same path answers a
    // fixed generic message. What must hold in EVERY environment is that the
    // response carries a stable error code and no stack frames — a caller must
    // never be handed the shape of the backend's internals.
    repo.findRecordForCitizen.mockRejectedValue(new Error('connection to db-primary refused'));

    const response = await authorized(`${BASE}/${RECORD_ID}`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toMatch(/at Object|\.ts:\d+|node_modules/);
  });

  it('builds the response from stored rows, not from anything the caller sent', async () => {
    const response = await authorized(`${BASE}/${RECORD_ID}`)
      .query({ })
      .set('X-Forged-Record-Type', 'BANK_DETAILS');

    expect(response.body.data.recordType).toBe('IDENTITY_RECORD');
  });
});
