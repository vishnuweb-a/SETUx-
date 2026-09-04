import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The Phase 5 §45 attack scenarios.
 *
 * The premise: the attacker fully controls the request — headers, query string,
 * path — and controls the frontend. What they do not control is which rows the
 * repository selects, or the `profiles` row their token resolves to.
 *
 * The repository is stubbed here as a *faithful* store rather than a fixed
 * answer: it applies the same ACTIVE-only rule the real one does, so a test
 * that reaches an INACTIVE service would be reaching it through the API, not
 * through a mock that forgot to filter.
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
// Re-exported through the mocked module, which spreads the real one.
const { DatabaseError } = await import('../../src/database/index.js');

const findProfileByIdMock = vi.mocked(findProfileById);
const repo = {
  listActiveServices: vi.mocked(serviceRepository.listActiveServices),
  findActiveServiceById: vi.mocked(serviceRepository.findActiveServiceById),
  listActiveServiceDepartments: vi.mocked(serviceRepository.listActiveServiceDepartments),
  listServiceRequirements: vi.mocked(serviceRepository.listServiceRequirements),
};

const app = createApp();

const PUBLISHED_ID = '11111111-1111-4111-8111-111111111111';
const WITHDRAWN_ID = '22222222-2222-4222-8222-222222222222';

/** The catalogue as the database holds it, including a row no citizen may see. */
const ALL_SERVICES = [
  {
    id: PUBLISHED_ID,
    code: 'SCHOLARSHIP_MERIT',
    name: 'National Merit Scholarship',
    description: 'Merit-based scholarship for undergraduate students.',
    department: 'Higher Education',
    status: 'ACTIVE',
  },
  {
    id: WITHDRAWN_ID,
    code: 'SCHOLARSHIP_LEGACY',
    name: 'Legacy Scholarship Scheme (Withdrawn)',
    description: 'A scheme no longer offered through SetuX.',
    department: 'Higher Education',
    status: 'INACTIVE',
  },
];

const withoutStatus = ({ status: _status, ...summary }: (typeof ALL_SERVICES)[number]) => summary;

const CITIZEN = {
  id: 'citizen-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'COMPLETED',
} as const;

const signInAs = (user: typeof CITIZEN): void => {
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

  // The publication rule, applied exactly as the real repository applies it.
  repo.listActiveServices.mockImplementation(async () => {
    const active = ALL_SERVICES.filter((service) => service.status === 'ACTIVE');
    return { items: active.map(withoutStatus), total: active.length };
  });

  repo.findActiveServiceById.mockImplementation(async (id: string) => {
    const match = ALL_SERVICES.find(
      (service) => service.id === id && service.status === 'ACTIVE',
    );
    return match ? withoutStatus(match) : null;
  });

  repo.listActiveServiceDepartments.mockResolvedValue(['Higher Education']);
  repo.listServiceRequirements.mockResolvedValue([]);
});

describe('service visibility', () => {
  it('never lists a withdrawn service', async () => {
    const response = await authorized('/api/v1/services');

    const codes = response.body.data.items.map((item: { code: string }) => item.code);
    expect(codes).toEqual(['SCHOLARSHIP_MERIT']);
    expect(codes).not.toContain('SCHOLARSHIP_LEGACY');
  });

  it('answers 404 for a withdrawn service addressed directly by id', async () => {
    const response = await authorized(`/api/v1/services/${WITHDRAWN_ID}`);

    expect(response.status).toBe(404);
  });

  it('answers a withdrawn service exactly as it answers an unknown one', async () => {
    const withdrawn = await authorized(`/api/v1/services/${WITHDRAWN_ID}`);
    const unknown = await authorized('/api/v1/services/33333333-3333-4333-8333-333333333333');

    // Identical status and code: the response cannot be used to confirm that an
    // unpublished service exists.
    expect(withdrawn.status).toBe(unknown.status);
    expect(withdrawn.body.error.code).toBe(unknown.body.error.code);
    expect(withdrawn.body.error.message).toBe(unknown.body.error.message);
  });

  it('does not leak a withdrawn service through its requirements', async () => {
    const response = await authorized(`/api/v1/services/${WITHDRAWN_ID}/requirements`);

    expect(response.status).toBe(404);
    expect(repo.listServiceRequirements).not.toHaveBeenCalled();
  });

  it('does not expose the status column on a listed service', async () => {
    const response = await authorized('/api/v1/services');

    expect(response.body.data.items[0]).not.toHaveProperty('status');
  });
});

describe('query manipulation', () => {
  it('refuses an attempt to select a status', async () => {
    const response = await authorized('/api/v1/services?status=INACTIVE');

    expect(response.status).toBe(400);
    expect(repo.listActiveServices).not.toHaveBeenCalled();
  });

  it('refuses an attempt to widen the page size', async () => {
    const response = await authorized('/api/v1/services?limit=100000');

    expect(response.status).toBe(400);
  });

  it('refuses an injected ordering parameter', async () => {
    const response = await authorized('/api/v1/services?order=status.desc');

    expect(response.status).toBe(400);
  });

  it('treats SQL metacharacters in a search term as text', async () => {
    const response = await authorized("/api/v1/services?search=%27%3B%20drop%20table%20services--");

    // Accepted as an ordinary term and passed as a bound parameter — never
    // interpolated — so the request succeeds and simply matches nothing.
    expect(response.status).toBe(200);
    expect(repo.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ search: "'; drop table services--" }),
    );
  });

  it('rejects a search term beyond the documented length', async () => {
    const response = await authorized(`/api/v1/services?search=${'a'.repeat(200)}`);

    expect(response.status).toBe(400);
  });
});

describe('error safety', () => {
  /**
   * The failure the catalogue can actually produce.
   *
   * `toAppError` wraps every PostgREST failure into a `DatabaseError` before it
   * leaves the repository, so this is the path a real database fault takes. Its
   * message is fixed at construction and the driver's own text is kept in
   * `cause` for the log — which is what stops a constraint name or a relation
   * name reaching the client (exception-handling.md §29, §33).
   */
  it('does not leak database internals when a query fails', async () => {
    repo.listActiveServices.mockRejectedValue(
      new DatabaseError(
        'The request could not be completed.',
        new Error('relation "public.services" does not exist at character 42'),
      ),
    );

    const response = await authorized('/api/v1/services');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('public.services');
    expect(JSON.stringify(response.body)).not.toContain('character 42');
  });

  it('returns a correlation id rather than a stack trace', async () => {
    repo.listActiveServices.mockRejectedValue(
      new DatabaseError('The request could not be completed.'),
    );

    const response = await authorized('/api/v1/services');

    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(/\bat\s+\w+.*:\d+:\d+/);
  });
});

/**
 * The Phase 5 §46 boundary, asserted at the HTTP layer.
 *
 * Browsing must not write. There is no mutation route in this module and no
 * repository function that writes, so the check here is that the catalogue
 * refuses every verb but GET.
 */
describe('phase boundary', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'refuses to %s the catalogue',
    async (method) => {
      const agent = request(app);
      const response = await agent[method]('/api/v1/services')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(404);
    },
  );

  it('exposes no application-creating route under the catalogue', async () => {
    const response = await request(app)
      .post(`/api/v1/services/${PUBLISHED_ID}/apply`)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(404);
  });
});
