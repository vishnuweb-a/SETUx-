import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The attack scenarios Phase 3 §32 requires be proven, exercised against the
 * real middleware chain.
 *
 * The premise throughout: the attacker fully controls the request — headers,
 * body, query string — and controls the frontend. The only thing they do not
 * control is the `profiles` row their verified token resolves to.
 */

const getUser = vi.fn();
const signInWithPassword = vi.fn();
const adminSignOut = vi.fn();

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    // Auth operations run on isolated clients so one user's sign-in cannot
    // mutate the shared client's session; both factories are stubbed here.
    getDatabaseClient: () => ({
      auth: { getUser, signInWithPassword, admin: { signOut: adminSignOut } },
    }),
    createIsolatedAuthClient: () => ({
      auth: { getUser, signInWithPassword, admin: { signOut: adminSignOut } },
    }),
  };
});

vi.mock('../../src/modules/auth/auth.repository.js', () => ({ findProfileById: vi.fn() }));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const findProfileByIdMock = vi.mocked(findProfileById);
const { createApp } = await import('../../src/app.js');

const app = createApp();

/** A real, fully authenticated citizen — the attacker in most scenarios below. */
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

const signedInAsCitizen = (): void => {
  getUser.mockResolvedValue({
    data: { user: { id: CITIZEN.id, email: CITIZEN.email } },
    error: null,
  });
  findProfileByIdMock.mockResolvedValue(CITIZEN);
};

beforeEach(() => {
  getUser.mockReset();
  signInWithPassword.mockReset();
  findProfileByIdMock.mockReset();
});

describe('ATTACK 1 — a citizen claims the officer role through client state', () => {
  it('ignores a role asserted in a client-controlled header', async () => {
    signedInAsCitizen();

    await request(app)
      .get('/api/v1/government/dashboard')
      .set('Authorization', 'Bearer valid')
      .set('X-User-Role', 'GOVERNMENT_OFFICER')
      .set('X-Role', 'GOVERNMENT_OFFICER')
      .expect(403);
  });

  it('reports the role from the database, not from the headers the client sent', async () => {
    signedInAsCitizen();

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid')
      .set('X-User-Role', 'GOVERNMENT_OFFICER')
      .set('X-User-ID', OFFICER.id)
      .expect(200);

    expect(response.body.data.profile.role).toBe('CITIZEN');
    expect(response.body.data.user.id).toBe(CITIZEN.id);
  });
});

describe('ATTACK 2 — a client supplies its own role in the payload', () => {
  it('ignores a role in the request body', async () => {
    signedInAsCitizen();

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid')
      .send({ role: 'GOVERNMENT_OFFICER', userId: OFFICER.id })
      .expect(200);

    // The privileged area is still closed to them afterwards.
    await request(app)
      .get('/api/v1/government/dashboard')
      .set('Authorization', 'Bearer valid')
      .send({ role: 'GOVERNMENT_OFFICER' })
      .expect(403);
  });

  it('ignores a role in the query string', async () => {
    signedInAsCitizen();

    await request(app)
      .get('/api/v1/government/dashboard?role=GOVERNMENT_OFFICER')
      .set('Authorization', 'Bearer valid')
      .expect(403);
  });

  it('does not let a role in the login payload influence the resolved role', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: CITIZEN.id, email: CITIZEN.email },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CITIZEN.email, password: 'pw', role: 'GOVERNMENT_OFFICER' })
      .expect(200);

    expect(response.body.data.profile.role).toBe('CITIZEN');
  });
});

describe('ATTACK 3 — a citizen calls a government endpoint directly', () => {
  it('denies with 403 even though the caller is fully authenticated', async () => {
    signedInAsCitizen();

    const response = await request(app)
      .get('/api/v1/government/dashboard')
      .set('Authorization', 'Bearer valid')
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('ATTACK 4 — an unauthenticated client calls a protected endpoint', () => {
  it.each([
    ['/api/v1/auth/me'],
    ['/api/v1/citizen/dashboard'],
    ['/api/v1/government/dashboard'],
  ])('returns 401 for %s', async (path) => {
    const response = await request(app).get(path).expect(401);

    expect(response.body.success).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('ATTACK 5 — an authenticated user with the wrong role', () => {
  it('denies an officer reaching the citizen area (roles are not hierarchical)', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: OFFICER.id, email: OFFICER.email } },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(OFFICER);

    await request(app)
      .get('/api/v1/citizen/dashboard')
      .set('Authorization', 'Bearer valid')
      .expect(403);
  });
});

describe('ATTACK 6 — a client substitutes another user identity', () => {
  it('resolves the profile from the token subject, never from a client-supplied id', async () => {
    signedInAsCitizen();

    await request(app)
      .get('/api/v1/citizen/dashboard')
      .set('Authorization', 'Bearer valid')
      .set('X-User-ID', 'someone-else')
      .query({ userId: 'someone-else' })
      .expect(200);

    // The profile lookup used the id the Auth server returned and nothing else.
    expect(findProfileByIdMock).toHaveBeenCalledWith(CITIZEN.id);
    expect(findProfileByIdMock).not.toHaveBeenCalledWith('someone-else');
  });
});

describe('error responses disclose nothing sensitive', () => {
  it('does not leak the token, the required role, or internals on a denial', async () => {
    signedInAsCitizen();

    const response = await request(app)
      .get('/api/v1/government/dashboard')
      .set('Authorization', 'Bearer super-secret-token-value')
      .expect(403);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('super-secret-token-value');
    expect(serialised).not.toContain('GOVERNMENT_OFFICER');
    expect(serialised).not.toContain('profiles');
  });

  it('does not reveal why a token was rejected', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'signature verification failed for key kid=abc123' },
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer forged')
      .expect(401);

    expect(JSON.stringify(response.body)).not.toContain('kid=abc123');
    expect(response.body.error.message).toBe('Authentication is required.');
  });
});

describe('credential rate limiting', () => {
  /**
   * Regression: an IP-keyed limit is a denial-of-service vector wherever users
   * share an address. Attacking one account must not exhaust the budget for
   * everybody behind that address.
   */
  it('caps attempts per account without locking out other accounts', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    // Exhaust the budget for one account.
    const attacked = [];
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'victim@example.com', password: 'guess' });
      attacked.push(response.status);
    }

    expect(attacked).toContain(429);

    // A different account, same client address, still gets through to the
    // Auth server rather than being refused by the limiter.
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: CITIZEN.id, email: CITIZEN.email },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CITIZEN.email, password: 'correct-password' })
      .expect(200);
  });
});
