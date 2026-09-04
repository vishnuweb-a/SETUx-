import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 5 catalogue contract, exercised against the real middleware chain
 * and the real controller and service layers.
 *
 * Only the two edges are stubbed: the Supabase Auth server and the catalogue
 * repository. Everything between them — `requireAuth`, `validateRequest`, the
 * controller, the service, the error handler — is the code under test.
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

vi.mock('../../src/modules/services/service.repository.js', () => ({
  listActiveServices: vi.fn(),
  findActiveServiceById: vi.fn(),
  listActiveServiceDepartments: vi.fn(),
  listServiceRequirements: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const serviceRepository = await import('../../src/modules/services/service.repository.js');
const { createApp } = await import('../../src/app.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  listActiveServices: vi.mocked(serviceRepository.listActiveServices),
  findActiveServiceById: vi.mocked(serviceRepository.findActiveServiceById),
  listActiveServiceDepartments: vi.mocked(serviceRepository.listActiveServiceDepartments),
  listServiceRequirements: vi.mocked(serviceRepository.listServiceRequirements),
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

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';

const SCHOLARSHIP = {
  id: SERVICE_ID,
  code: 'SCHOLARSHIP_MERIT',
  name: 'National Merit Scholarship',
  description: 'Merit-based scholarship for undergraduate students.',
  department: 'Higher Education',
};

const REQUIREMENTS = [
  {
    id: 'req-1',
    code: 'IDENTITY',
    name: 'Identity Verification',
    description: 'Confirms identity against the national registry.',
    type: 'IDENTITY' as const,
    source: 'Identity Registry (Mock)',
    required: true,
    displayOrder: 1,
  },
  {
    id: 'req-2',
    code: 'BANK_DETAILS',
    name: 'Bank Account Proof',
    description: null,
    type: 'DOCUMENT' as const,
    source: 'DigiLocker (Mock)',
    required: false,
    displayOrder: 2,
  },
];

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

beforeEach(() => {
  vi.clearAllMocks();
  signInAs(CITIZEN);
  repo.listActiveServices.mockResolvedValue({ items: [SCHOLARSHIP], total: 1 });
  repo.findActiveServiceById.mockResolvedValue(SCHOLARSHIP);
  repo.listActiveServiceDepartments.mockResolvedValue(['Higher Education', 'Social Welfare']);
  repo.listServiceRequirements.mockResolvedValue(REQUIREMENTS);
});

describe('GET /api/v1/services', () => {
  it('returns the catalogue to a signed-in citizen', async () => {
    const response = await authorized('/api/v1/services');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ code: 'SCHOLARSHIP_MERIT' });
  });

  it('applies the documented default page size', async () => {
    await authorized('/api/v1/services');

    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 12 }),
    );
  });

  it('passes a search term through to the repository', async () => {
    await authorized('/api/v1/services?search=merit');

    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'merit' }),
    );
  });

  it('treats a whitespace-only search as no filter at all', async () => {
    await authorized('/api/v1/services?search=%20%20%20');

    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('passes a department filter through to the repository', async () => {
    await authorized('/api/v1/services?department=Social%20Welfare');

    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ department: 'Social Welfare' }),
    );
  });

  it('coerces pagination parameters to numbers', async () => {
    await authorized('/api/v1/services?page=3&limit=5');

    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 5 }),
    );
  });

  it('reports at least one page when the catalogue is empty', async () => {
    repo.listActiveServices.mockResolvedValue({ items: [], total: 0 });

    const response = await authorized('/api/v1/services');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ total: 0, totalPages: 1 });
  });

  it('rejects a limit beyond the documented maximum', async () => {
    const response = await authorized('/api/v1/services?limit=500');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric page', async () => {
    const response = await authorized('/api/v1/services?page=abc');

    expect(response.status).toBe(400);
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  it('rejects a zero or negative page', async () => {
    const response = await authorized('/api/v1/services?page=0');

    expect(response.status).toBe(400);
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  it('rejects an unknown query parameter rather than ignoring it', async () => {
    const response = await authorized('/api/v1/services?status=INACTIVE');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/services/departments', () => {
  it('returns the departments that own a visible service', async () => {
    const response = await authorized('/api/v1/services/departments');

    expect(response.status).toBe(200);
    expect(response.body.data.departments).toEqual(['Higher Education', 'Social Welfare']);
  });

  it('is not captured by the :serviceId route', async () => {
    await authorized('/api/v1/services/departments');

    expect(repo.findActiveServiceById).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/services/:serviceId', () => {
  it('returns the service with its requirements', async () => {
    const response = await authorized(`/api/v1/services/${SERVICE_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: SERVICE_ID, code: 'SCHOLARSHIP_MERIT' });
    expect(response.body.data.requirements).toHaveLength(2);
  });

  it('preserves the display order the database defines', async () => {
    const response = await authorized(`/api/v1/services/${SERVICE_ID}`);

    expect(response.body.data.requirements.map((r: { code: string }) => r.code)).toEqual([
      'IDENTITY',
      'BANK_DETAILS',
    ]);
  });

  it('answers 404 for an unknown service', async () => {
    repo.findActiveServiceById.mockResolvedValue(null);

    const response = await authorized(`/api/v1/services/${SERVICE_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('does not read the requirements of a service it will not return', async () => {
    repo.findActiveServiceById.mockResolvedValue(null);

    await authorized(`/api/v1/services/${SERVICE_ID}`);

    expect(repo.listServiceRequirements).not.toHaveBeenCalled();
  });

  it('rejects a malformed identifier before reaching the database', async () => {
    const response = await authorized('/api/v1/services/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.findActiveServiceById).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/services/:serviceId/requirements', () => {
  it('returns the requirements', async () => {
    const response = await authorized(`/api/v1/services/${SERVICE_ID}/requirements`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it('answers 404 when the service is not visible', async () => {
    repo.findActiveServiceById.mockResolvedValue(null);

    const response = await authorized(`/api/v1/services/${SERVICE_ID}/requirements`);

    expect(response.status).toBe(404);
    expect(repo.listServiceRequirements).not.toHaveBeenCalled();
  });
});

describe('catalogue authorization', () => {
  it('refuses an anonymous request', async () => {
    const response = await request(app).get('/api/v1/services');

    expect(response.status).toBe(401);
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  it('refuses a request whose token the Auth server rejects', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });

    const response = await authorized('/api/v1/services');

    expect(response.status).toBe(401);
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  /**
   * The catalogue is authenticated, not citizen-only: RLS grants these rows to
   * `authenticated`, and the officer screens of later phases need to name the
   * service an application belongs to.
   */
  it('serves an authenticated officer', async () => {
    signInAs(OFFICER);

    const response = await authorized('/api/v1/services');

    expect(response.status).toBe(200);
  });
});
