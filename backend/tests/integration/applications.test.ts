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

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const repository = await import('../../src/modules/applications/application.repository.js');
const { ConflictError } = await import('../../src/shared/errors/index.js');
const { createApp } = await import('../../src/app.js');

const profileMock = vi.mocked(findProfileById);
const repo = Object.fromEntries(Object.entries(repository).map(([key, value]) => [key, vi.mocked(value)])) as { [K in keyof typeof repository]: ReturnType<typeof vi.mocked<(typeof repository)[K]>> };
const app = createApp();
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-09-04T08:00:00.000Z';
const SERVICE = { id: SERVICE_ID, code: 'SCHOLARSHIP_SPORTS', name: 'Sports Excellence Scholarship', department: 'Social Welfare', status: 'ACTIVE' };
const ROW = { id: APPLICATION_ID, application_number: 'STX-2026-000001', citizen_id: CITIZEN_ID, service_id: SERVICE_ID, status: 'DRAFT' as const, submitted_at: null, created_at: NOW, updated_at: NOW };
const PROFILE = { fullName: 'Synthetic Citizen', governmentId: 'SYN-10001', mobileNumber: '+919000000001', dateOfBirth: '2004-01-01' };
const REQUIREMENTS = [{ id: 'requirement-1', code: 'ACHIEVEMENT_DECL', name: 'Achievement Declaration', description: 'Describe the achievement.', type: 'DECLARATION' as const, source: null, required: true, displayOrder: 1 }];

const signIn = (overrides: Partial<{ role: 'CITIZEN' | 'GOVERNMENT_OFFICER'; onboardingStatus: 'NOT_STARTED' | 'COMPLETED' }> = {}) => {
  getUser.mockResolvedValue({ data: { user: { id: CITIZEN_ID, email: 'citizen@example.com' } }, error: null });
  profileMock.mockResolvedValue({ id: CITIZEN_ID, email: 'citizen@example.com', role: overrides.role ?? 'CITIZEN', onboardingStatus: overrides.onboardingStatus ?? 'COMPLETED' });
};
const authorized = (method: 'get' | 'post' | 'patch', path: string) =>
  request(app)[method](path).set('Authorization', 'Bearer valid-token');

beforeEach(() => {
  vi.clearAllMocks();
  signIn();
  repo.findServiceForApplication.mockResolvedValue(SERVICE);
  repo.insertApplication.mockResolvedValue(ROW);
  repo.findApplicationById.mockResolvedValue(ROW);
  repo.listApplicationsByCitizen.mockResolvedValue({ rows: [ROW], total: 1 });
  repo.findCitizenProfileForApplication.mockResolvedValue(PROFILE);
  repo.listApplicationFields.mockResolvedValue({ ACHIEVEMENT_DECL: 'State-level synthetic event.' });
  repo.listRequirementsForApplication.mockResolvedValue(REQUIREMENTS);
  repo.replaceApplicationFields.mockResolvedValue(undefined);
  repo.markApplicationSubmitted.mockResolvedValue({ ...ROW, status: 'SUBMITTED', submitted_at: NOW });
});

describe('application creation', () => {
  it('creates a draft for the authenticated citizen', async () => {
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: APPLICATION_ID, status: 'DRAFT' });
    expect(repo.insertApplication).toHaveBeenCalledWith({ citizenId: CITIZEN_ID, serviceId: SERVICE_ID });
  });
  it('rejects identity and status mass assignment', async () => {
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID, citizen_id: 'other', status: 'APPROVED' });
    expect(response.status).toBe(400);
    expect(repo.insertApplication).not.toHaveBeenCalled();
  });
  it('requires completed onboarding', async () => {
    signIn({ onboardingStatus: 'NOT_STARTED' });
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('APPLICATION_ONBOARDING_REQUIRED');
  });
  it('refuses officers', async () => {
    signIn({ role: 'GOVERNMENT_OFFICER' });
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID });
    expect(response.status).toBe(403);
  });
  it('does not create against an inactive service', async () => {
    repo.findServiceForApplication.mockResolvedValue({ ...SERVICE, status: 'INACTIVE' });
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID });
    expect(response.status).toBe(404);
  });
  it('maps the database uniqueness guard to a safe duplicate error', async () => {
    repo.insertApplication.mockRejectedValue(new ConflictError('Application already exists.'));
    const response = await authorized('post', '/api/v1/applications').send({ service_id: SERVICE_ID });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('APPLICATION_DUPLICATE_ACTIVE');
  });
});

describe('application ownership and lifecycle', () => {
  it('lists only through the authenticated citizen predicate', async () => {
    const response = await authorized('get', '/api/v1/applications');
    expect(response.status).toBe(200);
    expect(repo.listApplicationsByCitizen).toHaveBeenCalledWith(expect.objectContaining({ citizenId: CITIZEN_ID }));
  });
  it('returns a disclosure-safe 404 for an application not owned by the caller', async () => {
    repo.findApplicationById.mockResolvedValue(null);
    const response = await authorized('get', `/api/v1/applications/${APPLICATION_ID}`);
    expect(response.status).toBe(404);
  });
  it('saves only configured declaration fields', async () => {
    const fields = { ACHIEVEMENT_DECL: 'Synthetic achievement.' };
    const response = await authorized('patch', `/api/v1/applications/${APPLICATION_ID}`).send({ fields });
    expect(response.status).toBe(200);
    expect(repo.replaceApplicationFields).toHaveBeenCalledWith({ applicationId: APPLICATION_ID, citizenId: CITIZEN_ID, fields });
  });
  it('rejects a field that the service did not configure', async () => {
    const response = await authorized('patch', `/api/v1/applications/${APPLICATION_ID}`).send({ fields: { approved: 'true' } });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('APPLICATION_VALIDATION_ERROR');
  });
  it('does not edit a submitted application', async () => {
    repo.findApplicationById.mockResolvedValue({ ...ROW, status: 'SUBMITTED', submitted_at: NOW });
    const response = await authorized('patch', `/api/v1/applications/${APPLICATION_ID}`).send({ fields: {} });
    expect(response.status).toBe(409);
    expect(repo.replaceApplicationFields).not.toHaveBeenCalled();
  });
  it('submits a complete draft without invoking future phase repositories', async () => {
    const response = await authorized('post', `/api/v1/applications/${APPLICATION_ID}/submit`).send({});
    expect(response.status).toBe(200);
    expect(repo.markApplicationSubmitted).toHaveBeenCalledWith({ applicationId: APPLICATION_ID, citizenId: CITIZEN_ID });
  });
  it('rejects submit when a required declaration is absent', async () => {
    repo.listApplicationFields.mockResolvedValue({});
    const response = await authorized('post', `/api/v1/applications/${APPLICATION_ID}/submit`).send({});
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('APPLICATION_NOT_READY');
    expect(repo.markApplicationSubmitted).not.toHaveBeenCalled();
  });
  it('rejects arbitrary submit input', async () => {
    const response = await authorized('post', `/api/v1/applications/${APPLICATION_ID}/submit`).send({ status: 'APPROVED' });
    expect(response.status).toBe(400);
  });
  it('requires authentication on every endpoint', async () => {
    const response = await request(app).get('/api/v1/applications');
    expect(response.status).toBe(401);
  });
});
