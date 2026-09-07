import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 1 field policy contract, exercised against the real middleware
 * chain and the real controller and service layers
 * (Change & Correction Service).
 *
 * Only the two edges are stubbed: the Supabase Auth server and the policy
 * repository. Everything between them — `requireAuth`, `validateRequest`, the
 * controller, the service, the error handler — is the code under test.
 *
 * The security assertions at the end are the point of the phase. They establish
 * that the API has no path through which a client can author editability: no
 * mutation route exists, no schema admits a policy field, and the response is
 * built from the repository row rather than from anything the caller sent.
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

vi.mock('../../src/modules/field-policies/field-policy.repository.js', () => ({
  listActiveFieldPolicies: vi.fn(),
  findActiveFieldPolicy: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const policyRepository = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  listActiveFieldPolicies: vi.mocked(policyRepository.listActiveFieldPolicies),
  findActiveFieldPolicy: vi.mocked(policyRepository.findActiveFieldPolicy),
};

const app = createApp();

const CITIZEN = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const OFFICER = {
  id: 'officer-1',
  email: 'officer@example.gov.in',
  role: 'GOVERNMENT_OFFICER',
  onboardingStatus: 'COMPLETED',
} as const;

const HOLDER_NAME = {
  fieldKey: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
  dependencyGroup: 'LEGAL_NAME',
} as const;

const REGISTRY_REFERENCE = {
  fieldKey: 'identityRegistryReference',
  editability: 'IMMUTABLE',
  requiresEvidence: false,
  requiresReview: false,
  authority: 'Identity Authority',
  dependencyGroup: null,
} as const;

/** Signs the request in as the given user by making the token resolve to them. */
const signInAs = (user: typeof CITIZEN | typeof OFFICER): void => {
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

const BASE = '/api/v1/field-policies';

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(CITIZEN);
  repo.listActiveFieldPolicies.mockResolvedValue([HOLDER_NAME, REGISTRY_REFERENCE]);
  repo.findActiveFieldPolicy.mockResolvedValue(HOLDER_NAME);
});

describe('GET /api/v1/field-policies/:recordType', () => {
  it('returns the record type and its field policies to a citizen', async () => {
    const response = await authorized(`${BASE}/IDENTITY_RECORD`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        recordType: 'IDENTITY_RECORD',
        fields: [HOLDER_NAME, REGISTRY_REFERENCE],
      },
    });
  });

  it('returns the same policy to an officer', async () => {
    // The review phase will have to answer "why was this field editable?", and
    // it cannot answer it from an endpoint it may not call. The table's own RLS
    // grants `authenticated`, not CITIZEN, and the API matches it.
    signInAs(OFFICER);

    const response = await authorized(`${BASE}/EDUCATION_RECORD`);

    expect(response.status).toBe(200);
    expect(response.body.data.recordType).toBe('EDUCATION_RECORD');
  });

  it.each([
    'IDENTITY_RECORD',
    'INCOME_RECORD',
    'EDUCATION_RECORD',
    'COMMUNITY_RECORD',
    'BANK_DETAILS',
  ])('serves %s', async (recordType) => {
    const response = await authorized(`${BASE}/${recordType}`);

    expect(response.status).toBe(200);
    expect(repo.listActiveFieldPolicies).toHaveBeenCalledWith(recordType);
  });

  it('renders an empty policy set rather than failing', async () => {
    repo.listActiveFieldPolicies.mockResolvedValue([]);

    const response = await authorized(`${BASE}/BANK_DETAILS`);

    expect(response.status).toBe(200);
    expect(response.body.data.fields).toEqual([]);
  });

  it('rejects an unsupported record type before any query runs', async () => {
    const response = await authorized(`${BASE}/PASSPORT_RECORD`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.listActiveFieldPolicies).not.toHaveBeenCalled();
  });

  it('rejects a lower-case record type rather than normalising it', async () => {
    // Guessing at what the caller meant is how a validation boundary stops
    // being one.
    const response = await authorized(`${BASE}/identity_record`);

    expect(response.status).toBe(400);
    expect(repo.listActiveFieldPolicies).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const response = await request(app).get(`${BASE}/IDENTITY_RECORD`);

    expect(response.status).toBe(401);
    expect(repo.listActiveFieldPolicies).not.toHaveBeenCalled();
  });

  it('refuses a caller whose token the auth server rejects', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });

    const response = await authorized(`${BASE}/IDENTITY_RECORD`);

    expect(response.status).toBe(401);
    expect(repo.listActiveFieldPolicies).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/field-policies/:recordType/fields/:fieldKey', () => {
  it("returns one field's policy", async () => {
    const response = await authorized(`${BASE}/IDENTITY_RECORD/fields/identityHolderName`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ recordType: 'IDENTITY_RECORD', ...HOLDER_NAME });
    expect(repo.findActiveFieldPolicy).toHaveBeenCalledWith(
      'IDENTITY_RECORD',
      'identityHolderName',
    );
  });

  it('returns an IMMUTABLE policy rather than concealing the field', async () => {
    // Reading the policy is not the same as requesting the change. The UI is
    // required to SHOW an immutable field and explain why it is locked
    // (arch §11), so this read must succeed; it is the enforcement helper that
    // refuses, and only when a change is actually attempted.
    repo.findActiveFieldPolicy.mockResolvedValue(REGISTRY_REFERENCE);

    const response = await authorized(
      `${BASE}/IDENTITY_RECORD/fields/identityRegistryReference`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.editability).toBe('IMMUTABLE');
    expect(response.body.data.authority).toBe('Identity Authority');
  });

  it('answers 404 for a well-formed field key no policy governs', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(null);

    const response = await authorized(`${BASE}/IDENTITY_RECORD/fields/identityInvented`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FIELD_POLICY_NOT_FOUND');
  });

  it('rejects a malformed field key with 400, not 404', async () => {
    // The two are different answers and deserve different codes: 400 means
    // "that is not a field key at all", 404 means "no policy governs that
    // field". Collapsing them would make a typo look like a policy gap.
    const response = await authorized(`${BASE}/IDENTITY_RECORD/fields/Not-A-Key`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.findActiveFieldPolicy).not.toHaveBeenCalled();
  });

  it('rejects an unsupported record type on the field route too', async () => {
    const response = await authorized(`${BASE}/PASSPORT_RECORD/fields/passportNumber`);

    expect(response.status).toBe(400);
    expect(repo.findActiveFieldPolicy).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const response = await request(app).get(
      `${BASE}/IDENTITY_RECORD/fields/identityHolderName`,
    );

    expect(response.status).toBe(401);
  });
});

describe('security: the client cannot author policy', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'exposes no %s route on the policy collection',
    async (method) => {
      // Not "the write is rejected" — there is no write route at all. A client
      // cannot create a policy through the API even in principle.
      const response = await request(app)[method](`${BASE}/IDENTITY_RECORD`)
        .set('Authorization', 'Bearer valid-token')
        .send({ fieldKey: 'identityRegistryReference', editability: 'EDITABLE' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    },
  );

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'exposes no %s route on a single field policy',
    async (method) => {
      const response = await request(app)[method](`${BASE}/IDENTITY_RECORD/fields/identityRegistryReference`)
        .set('Authorization', 'Bearer valid-token')
        .send({ editability: 'EDITABLE', requiresEvidence: false });

      expect(response.status).toBe(404);
    },
  );

  it('ignores a forged editability supplied as a query parameter', async () => {
    // `?editability=EDITABLE` on an IMMUTABLE field. The route declares no
    // query schema and the controller reads none, so the parameter reaches
    // nothing: the response is built from the repository row alone.
    repo.findActiveFieldPolicy.mockResolvedValue(REGISTRY_REFERENCE);

    const response = await authorized(
      `${BASE}/IDENTITY_RECORD/fields/identityRegistryReference?editability=EDITABLE&requiresEvidence=false`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.editability).toBe('IMMUTABLE');
    expect(response.body.data.requiresEvidence).toBe(false);
  });

  it('ignores a forged policy body on the read endpoint', async () => {
    repo.findActiveFieldPolicy.mockResolvedValue(REGISTRY_REFERENCE);

    const response = await request(app)
      .get(`${BASE}/IDENTITY_RECORD/fields/identityRegistryReference`)
      .set('Authorization', 'Bearer valid-token')
      .send({ editability: 'EDITABLE', authority: 'Attacker' });

    expect(response.status).toBe(200);
    expect(response.body.data.editability).toBe('IMMUTABLE');
    expect(response.body.data.authority).toBe('Identity Authority');
  });

  it('derives the response from the repository, not from the request', async () => {
    // The same request, answered two different ways because the POLICY differs.
    // Nothing about the caller changed between these two calls.
    repo.findActiveFieldPolicy.mockResolvedValueOnce(HOLDER_NAME);
    const first = await authorized(`${BASE}/IDENTITY_RECORD/fields/identityHolderName`);

    repo.findActiveFieldPolicy.mockResolvedValueOnce(REGISTRY_REFERENCE);
    const second = await authorized(`${BASE}/IDENTITY_RECORD/fields/identityHolderName`);

    expect(first.body.data.editability).toBe('CONDITIONALLY_EDITABLE');
    expect(second.body.data.editability).toBe('IMMUTABLE');
  });

  it('exposes no internal configuration column', async () => {
    const response = await authorized(`${BASE}/IDENTITY_RECORD/fields/identityHolderName`);

    for (const internal of ['id', 'active', 'createdAt', 'updatedAt']) {
      expect(response.body.data).not.toHaveProperty(internal);
    }
  });

  it('reports a repository failure as a generic INTERNAL_ERROR with no stack trace', async () => {
    // The message itself is echoed outside production, deliberately, to make a
    // failure debuggable (`errorHandler`: `config.isProduction ? GENERIC : …`);
    // these tests run under NODE_ENV=test, so asserting the message were absent
    // would assert the wrong environment's behaviour. What must hold in EVERY
    // environment is asserted instead: the code is the generic one, no stack
    // reaches the body, and no partial data is returned alongside the failure.
    repo.listActiveFieldPolicies.mockRejectedValue(new Error('connection refused'));

    const response = await authorized(`${BASE}/IDENTITY_RECORD`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error).not.toHaveProperty('stack');
    expect(response.body).not.toHaveProperty('data');
  });
});
