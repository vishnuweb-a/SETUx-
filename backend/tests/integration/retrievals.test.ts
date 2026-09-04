import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

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
vi.mock('../../src/modules/applications/application.repository.js', () => ({
  insertApplication: vi.fn(),
  findApplicationById: vi.fn(),
  listApplicationsByCitizen: vi.fn(),
  findCitizenProfileForApplication: vi.fn(),
  listApplicationFields: vi.fn(),
  replaceApplicationFields: vi.fn(),
  markApplicationSubmitted: vi.fn(),
  findServiceForApplication: vi.fn(),
  listRequirementsForApplication: vi.fn(),
}));
vi.mock('../../src/modules/retrievals/retrieval.repository.js', () => ({
  listRetrievableRequirements: vi.fn(),
  listRetrievalsForApplication: vi.fn(),
  listRetrievedFields: vi.fn(),
  recordRetrievalSuccess: vi.fn(),
  recordRetrievalFailure: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const applicationRepository = await import('../../src/modules/applications/application.repository.js');
const retrievalRepository = await import('../../src/modules/retrievals/retrieval.repository.js');
const { registerConnector, FakeDigiLockerConnector, FAKE_DIGILOCKER_BEHAVIOUR } = await import(
  '../../src/connectors/index.js'
);
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const applications = Object.fromEntries(
  Object.entries(applicationRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as { [K in keyof typeof applicationRepository]: ReturnType<typeof vi.mocked<(typeof applicationRepository)[K]>> };
const retrievals = Object.fromEntries(
  Object.entries(retrievalRepository).map(([key, value]) => [key, vi.mocked(value)]),
) as { [K in keyof typeof retrievalRepository]: ReturnType<typeof vi.mocked<(typeof retrievalRepository)[K]>> };

const app = createApp();
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const REQUIREMENT_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_REQUIREMENT_ID = '66666666-6666-4666-8666-666666666666';
const RETRIEVAL_ID = '77777777-7777-4777-8777-777777777777';
const NOW = '2026-09-04T08:00:00.000Z';

const SERVICE = {
  id: SERVICE_ID,
  code: 'SCHOLARSHIP_MERIT',
  name: 'National Merit Scholarship',
  department: 'Education',
  status: 'ACTIVE',
};
const SUBMITTED_APPLICATION = {
  id: APPLICATION_ID,
  application_number: 'STX-2026-000001',
  citizen_id: CITIZEN_ID,
  service_id: SERVICE_ID,
  status: 'SUBMITTED' as const,
  submitted_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

const requirement = (consentStatus: string | null, overrides: Partial<{ sourceCode: string }> = {}) => ({
  requirementId: REQUIREMENT_ID,
  requirementCode: 'BANK_DETAILS',
  information: 'Bank Account Proof',
  dataSourceId: SOURCE_ID,
  sourceCode: overrides.sourceCode ?? 'DIGILOCKER_MOCK',
  sourceName: 'DigiLocker (Mock)',
  consentStatus,
  displayOrder: 4,
});

const successRow = () => ({
  id: RETRIEVAL_ID,
  application_id: APPLICATION_ID,
  data_source_id: SOURCE_ID,
  consent_id: '88888888-8888-4888-8888-888888888888',
  requirement_id: REQUIREMENT_ID,
  request_reference: 'SYNTH-DL-ABCDEF123456',
  status: 'SUCCESS' as const,
  attempt_number: 1,
  response_metadata: {
    documentType: 'BANK_ACCOUNT_PROOF',
    issuer: 'Demo Public Bank (Simulated)',
    issuedOn: '2026-01-15',
    labels: { bankAccountMasked: 'Account number', bankAccountHolder: 'Account holder' },
    simulated: true,
  },
  error_code: null,
  error_message: null,
  completed_at: NOW,
  created_at: NOW,
});

const failureRow = () => ({
  ...successRow(),
  status: 'FAILED' as const,
  request_reference: null,
  response_metadata: null,
  error_code: 'PROVIDER_UNAVAILABLE',
  error_message: 'The simulated DigiLocker service did not respond.',
  completed_at: NOW,
});

const signIn = (
  overrides: Partial<{
    role: 'CITIZEN' | 'GOVERNMENT_OFFICER';
    onboardingStatus: 'NOT_STARTED' | 'COMPLETED';
  }> = {},
) => {
  getUser.mockResolvedValue({
    data: { user: { id: CITIZEN_ID, email: 'citizen@example.com' } },
    error: null,
  });
  profileMock.mockResolvedValue({
    id: CITIZEN_ID,
    email: 'citizen@example.com',
    role: overrides.role ?? 'CITIZEN',
    onboardingStatus: overrides.onboardingStatus ?? 'COMPLETED',
  });
};

const path = `/api/v1/applications/${APPLICATION_ID}/retrievals`;
const authorized = (method: 'get' | 'post') =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');
const retrieve = (body: Record<string, unknown> = { requirementId: REQUIREMENT_ID }) =>
  authorized('post').send(body);

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the healthy provider: one test swaps in a failing one.
  registerConnector(new FakeDigiLockerConnector());
  signIn();
  applications.findApplicationById.mockResolvedValue(SUBMITTED_APPLICATION);
  applications.findServiceForApplication.mockResolvedValue(SERVICE);
  retrievals.listRetrievableRequirements.mockResolvedValue([requirement('GRANTED')]);
  retrievals.listRetrievalsForApplication.mockResolvedValue([]);
  retrievals.listRetrievedFields.mockResolvedValue([]);
  retrievals.recordRetrievalSuccess.mockResolvedValue(successRow());
  retrievals.recordRetrievalFailure.mockResolvedValue(failureRow());
});

describe('authentication and role', () => {
  it('refuses an anonymous caller', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post(path).send({ requirementId: REQUIREMENT_ID })).status).toBe(401);
  });

  it('refuses a government officer', async () => {
    signIn({ role: 'GOVERNMENT_OFFICER' });
    expect((await authorized('get')).status).toBe(403);
    expect((await retrieve()).status).toBe(403);
  });

  it('refuses a citizen who has not completed onboarding', async () => {
    signIn({ onboardingStatus: 'NOT_STARTED' });
    const response = await retrieve();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_ONBOARDING_REQUIRED');
  });

  it('does not call the provider for an unauthenticated request', async () => {
    await request(app).post(path).send({ requirementId: REQUIREMENT_ID });
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });
});

describe('consent enforcement', () => {
  it('retrieves when consent is GRANTED', async () => {
    const response = await retrieve();
    expect(response.status).toBe(201);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledTimes(1);
  });

  it('refuses when consent is still PENDING, and retrieves nothing', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement('PENDING')]);
    const response = await retrieve();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_REQUIRED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
    expect(retrievals.recordRetrievalFailure).not.toHaveBeenCalled();
  });

  it('refuses when consent is DENIED, and retrieves nothing', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement('DENIED')]);
    const response = await retrieve();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_DENIED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('refuses when no consent record exists at all', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement(null)]);
    const response = await retrieve();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_REQUIRED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('refuses a REVOKED consent, which is not a grant', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement('REVOKED')]);
    expect((await retrieve()).status).toBe(403);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('does not let a grant on one requirement authorize another', async () => {
    // Only the first requirement is granted; the request names the second.
    retrievals.listRetrievableRequirements.mockResolvedValue([
      requirement('GRANTED'),
      { ...requirement('DENIED'), requirementId: OTHER_REQUIREMENT_ID, requirementCode: 'COMMUNITY_RECORD' },
    ]);
    const response = await retrieve({ requirementId: OTHER_REQUIREMENT_ID });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('RETRIEVAL_CONSENT_DENIED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });
});

describe('cross-citizen access', () => {
  it('conceals another citizen’s application as absent', async () => {
    applications.findApplicationById.mockResolvedValue(null);
    const response = await retrieve();
    expect(response.status).toBe(404);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('scopes the read to the caller, never to a client-supplied citizen', async () => {
    await authorized('get');
    expect(retrievals.listRetrievableRequirements).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      citizenId: CITIZEN_ID,
      serviceId: SERVICE_ID,
    });
  });
});

describe('input the client is not trusted with', () => {
  it('rejects a body carrying a citizen id', async () => {
    const response = await retrieve({ requirementId: REQUIREMENT_ID, citizenId: 'other' });
    expect(response.status).toBe(400);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('rejects a body naming its own data source', async () => {
    const response = await retrieve({ requirementId: REQUIREMENT_ID, dataSourceId: SOURCE_ID });
    expect(response.status).toBe(400);
  });

  it('rejects a body asserting its own consent status', async () => {
    const response = await retrieve({ requirementId: REQUIREMENT_ID, consentStatus: 'GRANTED' });
    expect(response.status).toBe(400);
  });

  it('rejects a body supplying its own provider result', async () => {
    const response = await retrieve({
      requirementId: REQUIREMENT_ID,
      status: 'SUCCESS',
      providerReference: 'FORGED-1',
      values: { bankAccountMasked: 'XXXX9999' },
    });
    expect(response.status).toBe(400);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('rejects a body that asks the provider to fail', async () => {
    // There must be no client-facing failure switch (Phase 8 §26).
    const response = await retrieve({ requirementId: REQUIREMENT_ID, forceFailure: true });
    expect(response.status).toBe(400);
  });

  it('rejects a missing or malformed requirement id', async () => {
    expect((await retrieve({})).status).toBe(400);
    expect((await retrieve({ requirementId: 'not-a-uuid' })).status).toBe(400);
  });

  it('refuses a requirement that belongs to another service', async () => {
    // The requirement list is derived from THIS application's service, so an
    // unrelated id simply is not there.
    const response = await retrieve({ requirementId: OTHER_REQUIREMENT_ID });
    expect(response.status).toBe(404);
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('derives the source from configuration, not from the request', async () => {
    await retrieve();
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        citizenId: CITIZEN_ID,
        requirementId: REQUIREMENT_ID,
      }),
    );
  });
});

describe('application state', () => {
  it('refuses an application that has not been submitted', async () => {
    applications.findApplicationById.mockResolvedValue({
      ...SUBMITTED_APPLICATION,
      status: 'DRAFT',
      submitted_at: null,
    });
    const response = await retrieve();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RETRIEVAL_NOT_APPLICABLE');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('does not advance the application status', async () => {
    await retrieve();
    // Phase 8 retrieves; it does not move the workflow. Nothing in this module
    // may write applications.status.
    expect(applications.markApplicationSubmitted).not.toHaveBeenCalled();
  });
});

describe('idempotency and retry', () => {
  it('refuses a second retrieval once one has succeeded', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow()]);
    const response = await retrieve();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RETRIEVAL_ALREADY_COMPLETED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('allows a retry after a failed attempt', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([failureRow()]);
    const response = await retrieve();
    expect(response.status).toBe(201);
    expect(retrievals.recordRetrievalSuccess).toHaveBeenCalledTimes(1);
  });

  it('treats a success as final even when a later failure row exists', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([failureRow(), successRow()]);
    expect((await retrieve()).status).toBe(409);
  });

  it('reports the same state on repeated reads', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow()]);
    const first = await authorized('get');
    const second = await authorized('get');
    expect(first.body.data).toEqual(second.body.data);
  });
});

describe('provider failure', () => {
  beforeEach(() => {
    registerConnector(new FakeDigiLockerConnector(FAKE_DIGILOCKER_BEHAVIOUR.ALWAYS_FAIL));
  });

  it('reports the failure without writing retrieved data', async () => {
    const response = await retrieve();
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('RETRIEVAL_PROVIDER_FAILED');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });

  it('records the failed attempt for audit', async () => {
    await retrieve();
    expect(retrievals.recordRetrievalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        citizenId: CITIZEN_ID,
        requirementId: REQUIREMENT_ID,
        errorCode: 'PROVIDER_UNAVAILABLE',
      }),
    );
  });

  it('exposes no provider internals or stack trace to the client', async () => {
    const response = await retrieve();
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/stack|at Object|node_modules/iu);
    expect(response.body.error.message).toBe(
      'The government system did not respond. You can try again.',
    );
  });
});

describe('unsupported source', () => {
  it('does not claim a retrieval for a source no connector serves', async () => {
    // Phase 9 registered the four seeded sources, so this names one that is not
    // in the catalogue at all — the case a forged or newly seeded source hits.
    retrievals.listRetrievableRequirements.mockResolvedValue([
      requirement('GRANTED', { sourceCode: 'MOCK_UNREGISTERED_API' }),
    ]);
    const response = await retrieve();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RETRIEVAL_NOT_APPLICABLE');
    expect(retrievals.recordRetrievalSuccess).not.toHaveBeenCalled();
  });
});

describe('reading retrieval state', () => {
  it('reports AVAILABLE for a granted requirement with no attempt yet', async () => {
    const response = await authorized('get');
    expect(response.status).toBe(200);
    expect(response.body.data.items[0]).toMatchObject({
      requirementId: REQUIREMENT_ID,
      information: 'Bank Account Proof',
      source: 'DigiLocker (Mock)',
      isSimulated: true,
      availability: 'AVAILABLE',
      status: null,
    });
  });

  it('reports CONSENT_REQUIRED before the citizen decides', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement('PENDING')]);
    const response = await authorized('get');
    expect(response.body.data.items[0].availability).toBe('CONSENT_REQUIRED');
  });

  it('reports CONSENT_DENIED after a denial', async () => {
    retrievals.listRetrievableRequirements.mockResolvedValue([requirement('DENIED')]);
    const response = await authorized('get');
    expect(response.body.data.items[0].availability).toBe('CONSENT_DENIED');
  });

  it('reports COMPLETED with the retrieved values after a success', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow()]);
    retrievals.listRetrievedFields.mockResolvedValue([
      { fieldCode: 'bankAccountMasked', value: 'XXXXXX4409', sourceId: SOURCE_ID },
    ]);
    const response = await authorized('get');
    expect(response.body.data.items[0]).toMatchObject({
      availability: 'COMPLETED',
      status: 'SUCCESS',
      documentType: 'BANK_ACCOUNT_PROOF',
      issuer: 'Demo Public Bank (Simulated)',
      providerReference: 'SYNTH-DL-ABCDEF123456',
      retrievedAt: NOW,
      values: [{ label: 'Account number', value: 'XXXXXX4409' }],
    });
  });

  it('does not show values belonging to a different source', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow()]);
    retrievals.listRetrievedFields.mockResolvedValue([
      { fieldCode: 'bankAccountMasked', value: 'XXXXXX4409', sourceId: 'another-source' },
    ]);
    const response = await authorized('get');
    expect(response.body.data.items[0].values).toEqual([]);
  });

  it('reports RETRYABLE with a safe reason after a failure', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([failureRow()]);
    const response = await authorized('get');
    expect(response.body.data.items[0]).toMatchObject({
      availability: 'RETRYABLE',
      status: 'FAILED',
      failureReason: 'The simulated DigiLocker service did not respond.',
      values: [],
    });
  });

  it('never describes a retrieval as verified', async () => {
    retrievals.listRetrievalsForApplication.mockResolvedValue([successRow()]);
    const response = await retrieve();
    // Retrieval is not verification (Phase 8 §42). Neither the read payload nor
    // the write response may use that word.
    expect(JSON.stringify((await authorized('get')).body)).not.toMatch(/verified/iu);
    expect(JSON.stringify(response.body)).not.toMatch(/verified/iu);
  });
});
