import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

// The Auth server and the profiles table are stubbed; what is under test is the
// SetuX middleware chain and the HTTP contract around it.
const getUser = vi.fn();
const signInWithPassword = vi.fn();
const adminSignOut = vi.fn();
const adminCreateUser = vi.fn();
const adminDeleteUser = vi.fn();

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
      auth: {
        getUser,
        signInWithPassword,
        admin: {
          signOut: adminSignOut,
          createUser: adminCreateUser,
          deleteUser: adminDeleteUser,
        },
      },
    }),
  };
});

vi.mock('../../src/modules/auth/auth.repository.js', () => ({
  findProfileById: vi.fn(),
  insertProfile: vi.fn(),
}));

const { findProfileById, insertProfile } = await import(
  '../../src/modules/auth/auth.repository.js'
);
const findProfileByIdMock = vi.mocked(findProfileById);
const insertProfileMock = vi.mocked(insertProfile);
const { createApp } = await import('../../src/app.js');

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

/** Makes any bearer token resolve to the given SetuX profile. */
const signedInAs = (profile: typeof CITIZEN | typeof OFFICER): void => {
  getUser.mockResolvedValue({
    data: { user: { id: profile.id, email: profile.email } },
    error: null,
  });
  findProfileByIdMock.mockResolvedValue(profile);
};

beforeEach(() => {
  getUser.mockReset();
  signInWithPassword.mockReset();
  adminSignOut.mockReset();
  adminCreateUser.mockReset();
  adminDeleteUser.mockReset();
  findProfileByIdMock.mockReset();
  insertProfileMock.mockReset();
});

describe('POST /api/v1/auth/login', () => {
  it('returns the session and the server-resolved role', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: CITIZEN.id, email: CITIZEN.email },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 999 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CITIZEN.email, password: 'correct-password' })
      .expect(200);

    expect(response.body.data.profile.role).toBe('CITIZEN');
    expect(response.body.data.session.accessToken).toBe('at');
  });

  it('rejects invalid credentials with 401 and a non-specific message', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CITIZEN.email, password: 'wrong' })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects a malformed payload with 400 before touching the Auth server', async () => {
    await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' }).expect(400);

    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('never echoes the password back to the client', async () => {
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
      .send({ email: CITIZEN.email, password: 'super-secret-value' })
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain('super-secret-value');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the authenticated user and their resolved role', async () => {
    signedInAs(OFFICER);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body.data).toEqual({
      user: { id: OFFICER.id, email: OFFICER.email },
      profile: { role: 'GOVERNMENT_OFFICER', onboardingStatus: 'COMPLETED' },
    });
  });

  it('rejects a request with no credential (401 AUTH_TOKEN_MISSING)', async () => {
    const response = await request(app).get('/api/v1/auth/me').expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_MISSING');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header', async () => {
    await request(app).get('/api/v1/auth/me').set('Authorization', 'Basic abc').expect(401);
  });

  it('rejects an invalid token (401 AUTH_INVALID_TOKEN)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad signature' } });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer forged')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('reports an expired session distinctly so the client can re-authenticate', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer stale')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('refuses an authenticated identity with no SetuX profile rather than defaulting a role', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'orphan', email: 'o@e.com' } }, error: null });
    findProfileByIdMock.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid')
      .expect(403);

    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session server-side', async () => {
    signedInAs(CITIZEN);
    adminSignOut.mockResolvedValue({ error: null });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(adminSignOut).toHaveBeenCalledWith('valid-token', 'local');
  });

  it('requires authentication', async () => {
    await request(app).post('/api/v1/auth/logout').expect(401);
  });
});

describe('protected routes', () => {
  it('routes a citizen to the citizen area', async () => {
    signedInAs(CITIZEN);

    const response = await request(app)
      .get('/api/v1/citizen/dashboard')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(response.body.data.area).toBe('CITIZEN');
  });

  it('routes an officer to the government area', async () => {
    signedInAs(OFFICER);

    const response = await request(app)
      .get('/api/v1/government/dashboard')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(response.body.data.area).toBe('GOVERNMENT_OFFICER');
  });
});

describe('POST /api/v1/auth/signup', () => {
  const NEW_USER = { id: 'new-1', email: 'newcitizen@example.com' };

  const validPayload = {
    fullName: 'Asha Rao',
    email: NEW_USER.email,
    password: 'StrongPassword123!',
    confirmPassword: 'StrongPassword123!',
  };

  const accountCreated = (): void => {
    adminCreateUser.mockResolvedValue({ data: { user: NEW_USER }, error: null });
    insertProfileMock.mockResolvedValue({
      id: NEW_USER.id,
      email: NEW_USER.email,
      role: 'CITIZEN',
      onboardingStatus: 'NOT_STARTED',
    });
  };

  it('creates a citizen account and returns 201', async () => {
    accountCreated();

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send(validPayload)
      .expect(201);

    expect(response.body.data).toEqual({
      userId: NEW_USER.id,
      email: NEW_USER.email,
      role: 'CITIZEN',
    });
  });

  it('always assigns CITIZEN, even when the client asks for the officer role', async () => {
    accountCreated();

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...validPayload, role: 'GOVERNMENT_OFFICER' })
      .expect(201);

    expect(response.body.data.role).toBe('CITIZEN');
    // The role written to the database is the server's, not the client's.
    expect(insertProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CITIZEN' }),
    );
  });

  it('rejects a weak password before creating anything', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...validPayload, password: 'short', confirmPassword: 'short' })
      .expect(400);

    expect(adminCreateUser).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords server-side', async () => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...validPayload, confirmPassword: 'DifferentPassword123!' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(adminCreateUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);
  });

  it('reports an existing account as a conflict', async () => {
    adminCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send(validPayload)
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    // The provider's wording is not echoed back to the client.
    expect(JSON.stringify(response.body)).not.toContain('already been registered');
  });

  it('rolls the identity back when the profile cannot be written', async () => {
    adminCreateUser.mockResolvedValue({ data: { user: NEW_USER }, error: null });
    insertProfileMock.mockRejectedValue(new Error('insert failed'));
    adminDeleteUser.mockResolvedValue({ error: null });

    await request(app).post('/api/v1/auth/signup').send(validPayload).expect(500);

    // No orphan: an identity that can authenticate but resolves to no role
    // would fail every protected request.
    expect(adminDeleteUser).toHaveBeenCalledWith(NEW_USER.id);
  });

  it('never echoes the password back', async () => {
    accountCreated();

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send(validPayload)
      .expect(201);

    expect(JSON.stringify(response.body)).not.toContain('StrongPassword123!');
  });
});
