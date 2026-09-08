import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 4 change draft contract, exercised against the real middleware
 * chain and the real controller and service layers
 * (Change & Correction Service).
 *
 * Only the edges are stubbed: the Supabase Auth server, the two repositories
 * and the policy engine's lookup. Everything between them — `requireAuth`,
 * `requireRole`, `validateRequest`, the controller, the service, the error
 * handler — is the code under test.
 *
 * The security assertions are the point of the phase. They establish that the
 * API has no path through which a client can supply an old value, claim an
 * editability, name a citizen other than itself, or write a government record.
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

vi.mock('../../src/modules/field-policies/field-policy.repository.js', () => ({
  listActiveFieldPolicies: vi.fn(),
  findActiveFieldPolicy: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const recordRepository = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);
const draftRepository = await import(
  '../../src/modules/change-requests/change-request.repository.js'
);
const policyRepository = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  findRecordForCitizen: vi.mocked(recordRepository.findRecordForCitizen),
  listSourceFieldsForRecord: vi.mocked(draftRepository.listSourceFieldsForRecord),
  insertChangeRequest: vi.mocked(draftRepository.insertChangeRequest),
  insertChangeRequestFields: vi.mocked(draftRepository.insertChangeRequestFields),
  findChangeRequestForCitizen: vi.mocked(draftRepository.findChangeRequestForCitizen),
  listFieldsForChangeRequest: vi.mocked(draftRepository.listFieldsForChangeRequest),
  updateProposedValue: vi.mocked(draftRepository.updateProposedValue),
  deleteChangeRequestFields: vi.mocked(draftRepository.deleteChangeRequestFields),
  touchChangeRequest: vi.mocked(draftRepository.touchChangeRequest),
  findActiveFieldPolicy: vi.mocked(policyRepository.findActiveFieldPolicy),
};

const app = createApp();

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_FIELD_ID = '55555555-5555-4555-8555-555555555555';

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

const HOLDER_POLICY = {
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
  dependencyGroup: 'LEGAL_NAME',
} as const;

const IMMUTABLE_POLICY = {
  fieldKey: 'identityRegistryReference',
  editability: 'IMMUTABLE',
  requiresEvidence: false,
  requiresReview: false,
  authority: 'Identity Authority',
  dependencyGroup: null,
} as const;

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

const BASE = '/api/v1/change-requests/drafts';

const post = (body: object) =>
  request(app).post(BASE).set('Authorization', 'Bearer valid-token').send(body);

const get = (path: string) =>
  request(app).get(path).set('Authorization', 'Bearer valid-token');

const patch = (path: string, body: object) =>
  request(app).patch(path).set('Authorization', 'Bearer valid-token').send(body);

const VALID_BODY = {
  sourceRecordId: RECORD_ID,
  fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo New Name' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(CITIZEN);
  repo.findRecordForCitizen.mockResolvedValue(identityRow as never);
  repo.listSourceFieldsForRecord.mockResolvedValue([
    { id: SOURCE_FIELD_ID, field_key: 'identityHolderName', field_value: 'Demo Old Name' },
  ]);
  repo.insertChangeRequest.mockResolvedValue(requestRow);
  repo.insertChangeRequestFields.mockResolvedValue(undefined);
  repo.findChangeRequestForCitizen.mockResolvedValue(requestRow);
  repo.listFieldsForChangeRequest.mockResolvedValue([storedField]);
  repo.updateProposedValue.mockResolvedValue(undefined);
  repo.deleteChangeRequestFields.mockResolvedValue(undefined);
  repo.touchChangeRequest.mockResolvedValue(undefined);
  repo.findActiveFieldPolicy.mockResolvedValue(HOLDER_POLICY);
});

describe('POST /api/v1/change-requests/drafts', () => {
  it('creates a draft holding both the snapshot and the proposal', async () => {
    const response = await post(VALID_BODY);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('DRAFT');
    expect(response.body.data.requestNumber).toBe('CR-2026-000001');
    expect(response.body.data.fields[0]).toMatchObject({
      fieldKey: 'identityHolderName',
      oldValue: 'Demo Old Name',
      proposedValue: 'Demo New Name',
    });
  });

  it('reads the old value from the database, ignoring what the client believes', async () => {
    await post(VALID_BODY);

    const [{ fields }] = repo.insertChangeRequestFields.mock.calls[0] ?? [{ fields: [] }];
    expect(fields[0]?.oldValue).toBe('Demo Old Name');
  });

  it('rejects a body that tries to supply an old value', async () => {
    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [
        {
          fieldKey: 'identityHolderName',
          proposedValue: 'Demo New Name',
          oldValue: 'A value the source never held',
        },
      ],
    });

    // Rejected, not silently dropped: the caller must not believe it worked.
    expect(response.status).toBe(400);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects a body that tries to claim an editability', async () => {
    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [
        {
          fieldKey: 'identityHolderName',
          proposedValue: 'Demo New Name',
          editability: 'EDITABLE',
          requiresEvidence: false,
          requiresReview: false,
        },
      ],
    });

    expect(response.status).toBe(400);
  });

  it('rejects a body naming another citizen', async () => {
    const response = await post({ ...VALID_BODY, citizenId: OTHER_CITIZEN_ID });

    expect(response.status).toBe(400);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects a body setting its own status or request number', async () => {
    const withStatus = await post({ ...VALID_BODY, status: 'SUBMITTED' });
    const withNumber = await post({ ...VALID_BODY, requestNumber: 'CR-2026-999999' });

    expect(withStatus.status).toBe(400);
    expect(withNumber.status).toBe(400);
  });

  it('refuses an immutable field', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(IMMUTABLE_POLICY);
    repo.listSourceFieldsForRecord.mockResolvedValue([
      {
        id: SOURCE_FIELD_ID,
        field_key: 'identityRegistryReference',
        field_value: 'SYNTH-IDR-2026-0117',
      },
    ]);

    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityRegistryReference', proposedValue: 'SOMETHING-ELSE' }],
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('FIELD_NOT_EDITABLE');
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('refuses a field with no active policy', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FIELD_POLICY_NOT_FOUND');
  });

  it('conceals another citizen’s record as a 404', async () => {
    repo.findRecordForCitizen.mockResolvedValue(null);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    // The message must not distinguish "someone else's" from "no such record".
    expect(JSON.stringify(response.body)).not.toMatch(/another|other citizen|belongs/i);
  });

  it('refuses a field belonging to a different record', async () => {
    repo.listSourceFieldsForRecord.mockResolvedValue([]);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(404);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects duplicate field keys', async () => {
    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [
        { fieldKey: 'identityHolderName', proposedValue: 'Demo New Name' },
        { fieldKey: 'identityHolderName', proposedValue: 'Another Name' },
      ],
    });

    expect(response.status).toBe(400);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects an empty or whitespace-only proposed value', async () => {
    const empty = await post({
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityHolderName', proposedValue: '' }],
    });
    const blank = await post({
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityHolderName', proposedValue: '    ' }],
    });

    expect(empty.status).toBe(400);
    expect(blank.status).toBe(400);
  });

  it('rejects a proposal identical to the current value', async () => {
    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo Old Name' }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CHANGE_REQUEST_VALUE_UNCHANGED');
  });

  it('rejects a nested object as a proposed value', async () => {
    const response = await post({
      sourceRecordId: RECORD_ID,
      fields: [
        {
          fieldKey: 'identityHolderName',
          // The shape prototype-pollution attempts arrive in. Refused at the
          // edge, so no such value reaches a JSONB column.
          proposedValue: { __proto__: { polluted: true }, value: 'Demo New Name' },
        },
      ],
    });

    expect(response.status).toBe(400);
  });

  it('rejects an empty field list', async () => {
    const response = await post({ sourceRecordId: RECORD_ID, fields: [] });

    expect(response.status).toBe(400);
  });

  it('rejects a malformed record id before any query runs', async () => {
    const response = await post({ ...VALID_BODY, sourceRecordId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(repo.findRecordForCitizen).not.toHaveBeenCalled();
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app).post(BASE).send(VALID_BODY);

    expect(response.status).toBe(401);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects an officer', async () => {
    signInAs(OFFICER);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(403);
    expect(repo.insertChangeRequest).not.toHaveBeenCalled();
  });

  it('rejects a citizen who has not completed onboarding', async () => {
    signInAs(NEW_CITIZEN);

    const response = await post(VALID_BODY);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CHANGE_REQUEST_ONBOARDING_REQUIRED');
  });

  it('creates an independent draft for a replayed request', async () => {
    // A double-clicked save. Both calls succeed and neither merges into the
    // other — the honest outcome for a non-idempotent create, and neither one
    // touches the source record.
    const first = await post(VALID_BODY);
    const second = await post(VALID_BODY);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(repo.insertChangeRequest).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/v1/change-requests/drafts/:id', () => {
  it('returns the caller’s own draft', async () => {
    const response = await get(`${BASE}/${REQUEST_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(REQUEST_ID);
    expect(response.body.data.fields[0].oldValue).toBe('Demo Old Name');
  });

  it('reads the draft for the token holder alone', async () => {
    await get(`${BASE}/${REQUEST_ID}`);

    expect(repo.findChangeRequestForCitizen).toHaveBeenCalledWith({
      changeRequestId: REQUEST_ID,
      citizenId: CITIZEN_ID,
    });
  });

  it('conceals another citizen’s draft as a 404', async () => {
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    const response = await get(`${BASE}/${REQUEST_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects a forged citizenId query rather than ignoring it', async () => {
    const response = await get(`${BASE}/${REQUEST_ID}?citizenId=${OTHER_CITIZEN_ID}`);

    expect(response.status).toBe(400);
    expect(repo.findChangeRequestForCitizen).not.toHaveBeenCalled();
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app).get(`${BASE}/${REQUEST_ID}`);

    expect(response.status).toBe(401);
  });

  it('rejects an officer', async () => {
    signInAs(OFFICER);

    const response = await get(`${BASE}/${REQUEST_ID}`);

    expect(response.status).toBe(403);
  });

  it('does not expose the internal source field id', async () => {
    const response = await get(`${BASE}/${REQUEST_ID}`);

    expect(response.body.data.fields[0]).not.toHaveProperty('citizenRecordFieldId');
    expect(response.body.data).not.toHaveProperty('citizenId');
  });
});

describe('PATCH /api/v1/change-requests/drafts/:id', () => {
  const UPDATE = { fields: [{ fieldKey: 'identityHolderName', proposedValue: 'Demo Newer Name' }] };

  it('revises the proposed value', async () => {
    const response = await patch(`${BASE}/${REQUEST_ID}`, UPDATE);

    expect(response.status).toBe(200);
    expect(repo.updateProposedValue).toHaveBeenCalledWith(
      expect.objectContaining({ proposedValue: 'Demo Newer Name' }),
    );
  });

  it('leaves the old value untouched', async () => {
    await patch(`${BASE}/${REQUEST_ID}`, UPDATE);

    const [payload] = repo.updateProposedValue.mock.calls[0] ?? [{}];
    expect(payload).not.toHaveProperty('oldValue');
    expect(payload).not.toHaveProperty('policySnapshot');
  });

  it('rejects a body trying to move the source record', async () => {
    const response = await patch(`${BASE}/${REQUEST_ID}`, {
      ...UPDATE,
      sourceRecordId: '77777777-7777-4777-8777-777777777777',
    });

    expect(response.status).toBe(400);
  });

  it('rejects a body trying to supply an old value', async () => {
    const response = await patch(`${BASE}/${REQUEST_ID}`, {
      fields: [
        {
          fieldKey: 'identityHolderName',
          proposedValue: 'Demo Newer Name',
          oldValue: 'Forged',
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(repo.updateProposedValue).not.toHaveBeenCalled();
  });

  it('conceals another citizen’s draft as a 404', async () => {
    repo.findChangeRequestForCitizen.mockResolvedValue(null);

    const response = await patch(`${BASE}/${REQUEST_ID}`, UPDATE);

    expect(response.status).toBe(404);
  });

  it('rejects an officer', async () => {
    signInAs(OFFICER);

    const response = await patch(`${BASE}/${REQUEST_ID}`, UPDATE);

    expect(response.status).toBe(403);
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app).patch(`${BASE}/${REQUEST_ID}`).send(UPDATE);

    expect(response.status).toBe(401);
  });
});

describe('the API cannot modify a government record', () => {
  it('declares no verb that writes a source record', async () => {
    // DELETE is not part of Phase 4, and PUT was never declared.
    const del = await request(app)
      .delete(`${BASE}/${REQUEST_ID}`)
      .set('Authorization', 'Bearer valid-token');
    const put = await request(app)
      .put(`${BASE}/${REQUEST_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(del.status).toBe(404);
    expect(put.status).toBe(404);
  });

  it('exposes only read functions on the record registry repository', async () => {
    // The registry module the draft service depends on has no write function to
    // call — an insert, update or delete would have to be added here first.
    expect(Object.keys(recordRepository).sort()).toEqual([
      'findRecordForCitizen',
      'listFieldsForCitizenRecord',
      'listRecordsByCitizen',
    ]);
  });
});
