import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';
import {
  InvalidCredentialsError,
  InvalidTokenError,
  ProfileNotFoundError,
  SessionExpiredError,
} from '../../src/shared/errors/index.js';

// The service's contract is "what does SetuX do with what Supabase Auth
// returns", so the Auth client is stubbed and the database client with it.
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

vi.mock('../../src/modules/auth/auth.repository.js', () => ({
  findProfileById: vi.fn(),
}));

const { findProfileById } = await import('../../src/modules/auth/auth.repository.js');
const findProfileByIdMock = vi.mocked(findProfileById);

const { authenticate, resolveProfile, signIn, signOut, verifyAccessToken } = await import(
  '../../src/modules/auth/auth.service.js'
);

const CITIZEN = {
  id: 'user-1',
  email: 'citizen@example.com',
  role: 'CITIZEN',
  onboardingStatus: 'NOT_STARTED',
} as const;

describe('verifyAccessToken', () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it('returns the identity the Auth server confirms', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null });

    await expect(verifyAccessToken('token')).resolves.toEqual({ id: 'user-1', email: 'a@b.com' });
    // The token must be verified against the Auth server, not decoded locally.
    expect(getUser).toHaveBeenCalledWith('token');
  });

  it('reports an expired credential as a session expiry', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } });

    await expect(verifyAccessToken('token')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('reports any other rejection as an invalid token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad signature' } });

    await expect(verifyAccessToken('forged')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a verified identity that carries no email', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

    await expect(verifyAccessToken('token')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe('resolveProfile', () => {
  beforeEach(() => {
    findProfileByIdMock.mockReset();
  });

  it('returns the profile backing the identity', async () => {
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    await expect(resolveProfile('user-1')).resolves.toEqual(CITIZEN);
  });

  it('never invents a role when no profile exists', async () => {
    findProfileByIdMock.mockResolvedValue(null);

    await expect(resolveProfile('user-1')).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    getUser.mockReset();
    findProfileByIdMock.mockReset();
  });

  it('builds the auth context from the token and the database, not the caller', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'citizen@example.com' } },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    await expect(authenticate('token')).resolves.toEqual({
      userId: 'user-1',
      email: 'citizen@example.com',
      role: 'CITIZEN',
      onboardingStatus: 'NOT_STARTED',
    });
  });
});

describe('signIn', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    findProfileByIdMock.mockReset();
  });

  it('returns the session and the server-resolved role', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'citizen@example.com' },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 123 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);

    const result = await signIn('citizen@example.com', 'password');

    expect(result.profile.role).toBe('CITIZEN');
    expect(result.session).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 123 });
  });

  it('reports a wrong password and an unknown account identically', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const wrongPassword = await signIn('a@b.com', 'x').catch((e: unknown) => e);

    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'User not found' } });
    const noAccount = await signIn('nobody@b.com', 'x').catch((e: unknown) => e);

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(noAccount).toBeInstanceOf(InvalidCredentialsError);
    // Identical wording is what stops the endpoint being an enumeration oracle.
    expect((wrongPassword as Error).message).toBe((noAccount as Error).message);
  });

  it('fails sign-in when the account has no SetuX profile', async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'orphan', email: 'orphan@example.com' },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(null);

    await expect(signIn('orphan@example.com', 'pw')).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('signOut', () => {
  beforeEach(() => {
    adminSignOut.mockReset();
  });

  it('revokes the session server-side', async () => {
    adminSignOut.mockResolvedValue({ error: null });

    await signOut('token');

    expect(adminSignOut).toHaveBeenCalledWith('token', 'local');
  });

  it('succeeds without calling the Auth server when there is no token', async () => {
    await expect(signOut('')).resolves.toBeUndefined();
    expect(adminSignOut).not.toHaveBeenCalled();
  });

  it('does not fail logout when revocation errors', async () => {
    adminSignOut.mockResolvedValue({ error: { message: 'already revoked' } });

    await expect(signOut('stale')).resolves.toBeUndefined();
  });
});

describe('client isolation', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    getUser.mockReset();
    findProfileByIdMock.mockReset();
  });

  /**
   * Regression: `signInWithPassword` mutates the session of the client it is
   * called on. When sign-in shared the backend's service-role client, one user
   * signing in re-identified that client as them, and every subsequent request
   * — token verification and profile lookups included — ran with the wrong
   * identity. Auth operations must therefore never touch the shared client.
   */
  it('never performs auth operations on the shared service-role client', async () => {
    const database = await import('../../src/database/index.js');
    const sharedClientSpy = vi.spyOn(database, 'getDatabaseClient');

    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'citizen@example.com' },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
      },
      error: null,
    });
    findProfileByIdMock.mockResolvedValue(CITIZEN);
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'citizen@example.com' } },
      error: null,
    });
    adminSignOut.mockResolvedValue({ error: null });

    await signIn('citizen@example.com', 'password');
    await verifyAccessToken('token');
    await signOut('token');

    expect(sharedClientSpy).not.toHaveBeenCalled();
  });
});
