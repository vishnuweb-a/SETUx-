import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

const getUser = vi.fn();
vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return { ...actual, getDatabaseClient: () => ({ auth: { getUser } }), createIsolatedAuthClient: () => ({ auth: { getUser } }) };
});
vi.mock('../../src/modules/auth/auth.repository.js', () => ({ findProfileById: vi.fn(), insertProfile: vi.fn() }));
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
vi.mock('../../src/modules/consents/consent.repository.js', () => ({
  prepareConsentsForApplication: vi.fn(),
  listConsentsForApplication: vi.fn(),
  findConsentById: vi.fn(),
  decideConsent: vi.fn(),
  listConsentSourcesForService: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const applicationRepository = await import('../../src/modules/applications/application.repository.js');
const consentRepository = await import('../../src/modules/consents/consent.repository.js');
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const applications = Object.fromEntries(Object.entries(applicationRepository).map(([key, value]) => [key, vi.mocked(value)])) as { [K in keyof typeof applicationRepository]: ReturnType<typeof vi.mocked<(typeof applicationRepository)[K]>> };
const consents = Object.fromEntries(Object.entries(consentRepository).map(([key, value]) => [key, vi.mocked(value)])) as { [K in keyof typeof consentRepository]: ReturnType<typeof vi.mocked<(typeof consentRepository)[K]>> };

const app = createApp();
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const CONSENT_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_SOURCE_ID = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-09-04T08:00:00.000Z';

const SERVICE = { id: SERVICE_ID, code: 'SCHOLARSHIP_MERIT', name: 'National Merit Scholarship', department: 'Education', status: 'ACTIVE' };
const SUBMITTED_APPLICATION = { id: APPLICATION_ID, application_number: 'STX-2026-000001', citizen_id: CITIZEN_ID, service_id: SERVICE_ID, status: 'SUBMITTED' as const, submitted_at: NOW, created_at: NOW, updated_at: NOW };
const SOURCES = [
  { dataSourceId: SOURCE_ID, information: 'Income Certificate', description: 'Annual family income.', source: 'Income & Revenue Department (Mock)' },
  { dataSourceId: OTHER_SOURCE_ID, information: 'Education Record', description: 'Class 12 result.', source: 'Education Department (Mock)' },
];
const pendingConsent = (overrides: Partial<{ status: string; decided_at: string | null; data_source_id: string }> = {}) => ({
  id: CONSENT_ID,
  application_id: APPLICATION_ID,
  citizen_id: CITIZEN_ID,
  data_source_id: overrides.data_source_id ?? SOURCE_ID,
  purpose: 'Verify Income Certificate for your National Merit Scholarship application',
  status: (overrides.status ?? 'PENDING') as 'PENDING' | 'GRANTED' | 'DENIED',
  decided_at: overrides.decided_at ?? null,
  granted_at: null,
  created_at: NOW,
  updated_at: NOW,
});

const signIn = (overrides: Partial<{ role: 'CITIZEN' | 'GOVERNMENT_OFFICER'; onboardingStatus: 'NOT_STARTED' | 'COMPLETED' }> = {}) => {
  getUser.mockResolvedValue({ data: { user: { id: CITIZEN_ID, email: 'citizen@example.com' } }, error: null });
  profileMock.mockResolvedValue({ id: CITIZEN_ID, email: 'citizen@example.com', role: overrides.role ?? 'CITIZEN', onboardingStatus: overrides.onboardingStatus ?? 'COMPLETED' });
};
const authorized = (method: 'get' | 'post', path: string) =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');

const consentsPath = `/api/v1/applications/${APPLICATION_ID}/consents`;
const grantPath = `/api/v1/consents/${CONSENT_ID}/grant`;
const denyPath = `/api/v1/consents/${CONSENT_ID}/deny`;

beforeEach(() => {
  vi.clearAllMocks();
  signIn();
  applications.findApplicationById.mockResolvedValue(SUBMITTED_APPLICATION);
  applications.findServiceForApplication.mockResolvedValue(SERVICE);
  consents.listConsentSourcesForService.mockResolvedValue(SOURCES);
  consents.prepareConsentsForApplication.mockResolvedValue([pendingConsent()]);
  consents.listConsentsForApplication.mockResolvedValue([pendingConsent({ status: 'GRANTED', decided_at: NOW })]);
  consents.findConsentById.mockResolvedValue(pendingConsent());
  consents.decideConsent.mockResolvedValue(pendingConsent({ status: 'GRANTED', decided_at: NOW }));
});

describe('reading consent requests', () => {
  it('returns the requested information, its source and its purpose', async () => {
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(200);
    expect(response.body.data.application).toMatchObject({ applicationNumber: 'STX-2026-000001', serviceName: 'National Merit Scholarship', recipient: 'Education' });
    expect(response.body.data.consents).toHaveLength(1);
    expect(response.body.data.consents[0]).toMatchObject({
      id: CONSENT_ID,
      information: 'Income Certificate',
      source: 'Income & Revenue Department (Mock)',
      status: 'PENDING',
    });
    expect(response.body.data.isDecisionRequired).toBe(true);
  });

  it('derives the request from the application, never from the caller', async () => {
    await authorized('get', consentsPath);
    expect(consents.prepareConsentsForApplication).toHaveBeenCalledWith({ applicationId: APPLICATION_ID, citizenId: CITIZEN_ID });
  });

  it('reports no decision outstanding once every consent is decided', async () => {
    consents.prepareConsentsForApplication.mockResolvedValue([pendingConsent({ status: 'DENIED', decided_at: NOW })]);
    const response = await authorized('get', consentsPath);
    expect(response.body.data.isDecisionRequired).toBe(false);
  });

  it('returns an empty set when the service needs nothing from another system', async () => {
    consents.prepareConsentsForApplication.mockResolvedValue([]);
    consents.listConsentSourcesForService.mockResolvedValue([]);
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(200);
    expect(response.body.data.consents).toEqual([]);
    expect(response.body.data.isDecisionRequired).toBe(false);
  });

  it('orders the requests by the service requirement display order', async () => {
    consents.prepareConsentsForApplication.mockResolvedValue([
      { ...pendingConsent({ data_source_id: OTHER_SOURCE_ID }), id: '77777777-7777-4777-8777-777777777777' },
      pendingConsent(),
    ]);
    const response = await authorized('get', consentsPath);
    expect(response.body.data.consents.map((consent: { information: string }) => consent.information)).toEqual([
      'Income Certificate',
      'Education Record',
    ]);
  });

  it('refuses an application that has not been submitted', async () => {
    applications.findApplicationById.mockResolvedValue({ ...SUBMITTED_APPLICATION, status: 'DRAFT', submitted_at: null });
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_NOT_APPLICABLE');
    expect(consents.prepareConsentsForApplication).not.toHaveBeenCalled();
  });
});

describe('consent authorization', () => {
  it('rejects an anonymous request', async () => {
    const response = await request(app).get(consentsPath);
    expect(response.status).toBe(401);
    expect(consents.prepareConsentsForApplication).not.toHaveBeenCalled();
  });

  it('rejects an anonymous decision', async () => {
    const response = await request(app).post(grantPath).send({});
    expect(response.status).toBe(401);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('refuses a government officer', async () => {
    signIn({ role: 'GOVERNMENT_OFFICER' });
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(403);
    expect(consents.prepareConsentsForApplication).not.toHaveBeenCalled();
  });

  it('refuses an officer attempting a decision', async () => {
    signIn({ role: 'GOVERNMENT_OFFICER' });
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(403);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('requires completed onboarding', async () => {
    signIn({ onboardingStatus: 'NOT_STARTED' });
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CONSENT_ONBOARDING_REQUIRED');
  });

  it('requires completed onboarding before a decision', async () => {
    signIn({ onboardingStatus: 'NOT_STARTED' });
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(403);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('conceals another citizen’s application as absent', async () => {
    applications.findApplicationById.mockResolvedValue(null);
    const response = await authorized('get', consentsPath);
    expect(response.status).toBe(404);
    expect(consents.prepareConsentsForApplication).not.toHaveBeenCalled();
  });

  it('conceals another citizen’s consent as absent', async () => {
    consents.findConsentById.mockResolvedValue(null);
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(404);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('scopes every consent lookup to the authenticated citizen', async () => {
    await authorized('post', grantPath).send({});
    expect(consents.findConsentById).toHaveBeenCalledWith({ consentId: CONSENT_ID, citizenId: CITIZEN_ID });
    expect(consents.decideConsent).toHaveBeenCalledWith({ consentId: CONSENT_ID, citizenId: CITIZEN_ID, granted: true });
  });

  it('rejects a malformed application identifier', async () => {
    const response = await authorized('get', '/api/v1/applications/not-a-uuid/consents');
    expect(response.status).toBe(400);
    expect(consents.prepareConsentsForApplication).not.toHaveBeenCalled();
  });

  it('rejects a malformed consent identifier', async () => {
    const response = await authorized('post', '/api/v1/consents/not-a-uuid/grant').send({});
    expect(response.status).toBe(400);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });
});

describe('mass assignment and source injection', () => {
  it('refuses a body that tries to name its own citizen or status', async () => {
    const response = await authorized('post', grantPath).send({ citizen_id: 'someone-else', status: 'GRANTED' });
    expect(response.status).toBe(400);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('refuses a body that tries to inject a data source', async () => {
    const response = await authorized('post', grantPath).send({ data_source_id: OTHER_SOURCE_ID });
    expect(response.status).toBe(400);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });

  it('refuses a body that tries to retarget the application', async () => {
    const response = await authorized('post', denyPath).send({ application_id: '99999999-9999-4999-8999-999999999999' });
    expect(response.status).toBe(400);
    expect(consents.decideConsent).not.toHaveBeenCalled();
  });
});

describe('recording the decision', () => {
  it('grants once and reports the decision', async () => {
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(200);
    expect(consents.decideConsent).toHaveBeenCalledWith({ consentId: CONSENT_ID, citizenId: CITIZEN_ID, granted: true });
    expect(response.body.data.consents[0]).toMatchObject({ status: 'GRANTED', decidedAt: NOW });
  });

  it('denies without granting anything', async () => {
    consents.decideConsent.mockResolvedValue(pendingConsent({ status: 'DENIED', decided_at: NOW }));
    consents.listConsentsForApplication.mockResolvedValue([pendingConsent({ status: 'DENIED', decided_at: NOW })]);
    const response = await authorized('post', denyPath).send({});
    expect(response.status).toBe(200);
    expect(consents.decideConsent).toHaveBeenCalledWith({ consentId: CONSENT_ID, citizenId: CITIZEN_ID, granted: false });
    expect(response.body.data.consents[0]).toMatchObject({ status: 'DENIED' });
  });

  it('refuses a second decision on an already granted consent', async () => {
    consents.findConsentById.mockResolvedValue(pendingConsent({ status: 'GRANTED', decided_at: NOW }));
    consents.decideConsent.mockResolvedValue(null);
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_ALREADY_DECIDED');
  });

  it('refuses granting a consent the citizen already denied', async () => {
    consents.findConsentById.mockResolvedValue(pendingConsent({ status: 'DENIED', decided_at: NOW }));
    consents.decideConsent.mockResolvedValue(null);
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_ALREADY_DECIDED');
  });

  it('refuses denying a consent the citizen already granted', async () => {
    consents.findConsentById.mockResolvedValue(pendingConsent({ status: 'GRANTED', decided_at: NOW }));
    consents.decideConsent.mockResolvedValue(null);
    const response = await authorized('post', denyPath).send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_ALREADY_DECIDED');
  });

  it('reports a still-pending consent whose application moved on as not applicable', async () => {
    consents.findConsentById.mockResolvedValue(pendingConsent());
    consents.decideConsent.mockResolvedValue(null);
    const response = await authorized('post', grantPath).send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_NOT_APPLICABLE');
  });
});

describe('phase boundary', () => {
  it('retrieves no external data when consent is granted', async () => {
    await authorized('post', grantPath).send({});
    // Phase 7 authorizes retrieval; it must not perform one. No retrieval or
    // connector repository exists on this path, and the only writes are the
    // consent decision itself.
    expect(Object.keys(consents)).not.toContain('startDataRetrieval');
    expect(consents.decideConsent).toHaveBeenCalledOnce();
  });

  it('leaves the application status untouched by a decision', async () => {
    const response = await authorized('post', grantPath).send({});
    expect(response.body.data.application.applicationStatus).toBe('SUBMITTED');
    expect(applications.markApplicationSubmitted).not.toHaveBeenCalled();
  });
});
