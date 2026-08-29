import { createIsolatedAuthClient } from '../../database/index.js';
import {
  ConflictError,
  InvalidCredentialsError,
  InvalidTokenError,
  ProfileNotFoundError,
  SessionExpiredError,
} from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { findProfileById, insertProfile } from './auth.repository.js';
import {
  USER_ROLES,
  type AuthContext,
  type CurrentUserPayload,
  type LoginPayload,
  type Profile,
  type SignupPayload,
} from './auth.types.js';

/**
 * Auth-server messages that mean "this credential is past its lifetime".
 *
 * Matched so the client can be told to sign in again rather than shown a
 * generic failure. The distinction is surfaced only through the error *code* —
 * the message the user sees is the same either way.
 */
const EXPIRY_HINTS = ['expired', 'jwt expired'] as const;

const isExpiryError = (message: string): boolean => {
  const normalised = message.toLowerCase();
  return EXPIRY_HINTS.some((hint) => normalised.includes(hint));
};

/**
 * Verifies an access token against the Supabase Auth server.
 *
 * `getUser(jwt)` performs a network call to the Auth API rather than decoding
 * the token locally, so a revoked session or a deleted user is rejected
 * immediately instead of remaining valid until the token's own expiry. That
 * round trip is the point: local decoding would trust a signature alone.
 *
 * The token itself is never logged (security-design.md §13).
 *
 * @throws {SessionExpiredError} the credential was valid but has expired
 * @throws {InvalidTokenError}   the credential was rejected for any other reason
 */
export const verifyAccessToken = async (
  accessToken: string,
): Promise<{ id: string; email: string }> => {
  // Isolated for the same reason as sign-in: `getUser(jwt)` must not be able to
  // leave any per-user state behind on the shared client.
  const { data, error } = await createIsolatedAuthClient().auth.getUser(accessToken);

  if (error) {
    logger.warn({ reason: error.message }, 'Access token rejected');
    throw isExpiryError(error.message) ? new SessionExpiredError() : new InvalidTokenError();
  }

  const user = data.user;

  // An identity with no email cannot be reconciled with a SetuX profile.
  if (!user?.email) {
    logger.warn({ userId: user?.id }, 'Verified identity has no email address');
    throw new InvalidTokenError();
  }

  return { id: user.id, email: user.email };
};

/**
 * Resolves the SetuX role for an authenticated identity.
 *
 * The role comes exclusively from `profiles.role`, keyed by the id the Auth
 * server returned. A missing profile is an error, never a default: assigning
 * one here would silently provision an account, and defaulting to the
 * privileged role would be an escalation (auth-api.md §17, Phase 3 §16).
 *
 * @throws {ProfileNotFoundError} no profile backs this identity
 */
export const resolveProfile = async (userId: string): Promise<Profile> => {
  const profile = await findProfileById(userId);

  if (!profile) {
    logger.warn({ userId }, 'Authenticated identity has no SetuX profile');
    throw new ProfileNotFoundError();
  }

  return profile;
};

/**
 * The full authentication pipeline: credential → identity → role.
 *
 * This is the single function that turns an opaque bearer token into the
 * trusted {@link AuthContext} the rest of the backend authorizes against.
 */
export const authenticate = async (accessToken: string): Promise<AuthContext> => {
  const user = await verifyAccessToken(accessToken);
  const profile = await resolveProfile(user.id);

  return {
    userId: user.id,
    // The profile email mirrors the auth identity; the verified token wins if
    // the two ever disagree.
    email: user.email,
    role: profile.role,
    onboardingStatus: profile.onboardingStatus,
  };
};

/** Shapes the trusted context for `GET /auth/me` (auth-api.md §16). */
export const toCurrentUserPayload = (auth: AuthContext): CurrentUserPayload => ({
  user: { id: auth.userId, email: auth.email },
  profile: { role: auth.role, onboardingStatus: auth.onboardingStatus },
});

/**
 * Authenticates a credential pair and returns the resulting session.
 *
 * Sign-in is proxied through the backend rather than performed only in the
 * browser so that the rate limit and the role resolution below apply to every
 * attempt. The password is passed straight to Supabase Auth: SetuX never hashes
 * or stores it (auth-api.md §30, security-design.md §15).
 *
 * A failure is always reported as {@link InvalidCredentialsError}, regardless of
 * whether the account exists, so the endpoint cannot be used to enumerate users.
 *
 * @throws {InvalidCredentialsError} the credentials were not accepted
 * @throws {ProfileNotFoundError}    the account has no SetuX profile
 */
export const signIn = async (email: string, password: string): Promise<LoginPayload> => {
  // Isolated on purpose: signing in mutates the calling client's session, and
  // the shared service-role client must keep its own identity (see
  // `createIsolatedAuthClient`).
  const { data, error } = await createIsolatedAuthClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user?.email) {
    // Logged without the email so a log dump cannot be mined for valid
    // addresses; the request id already ties this line to the request.
    logger.warn({ reason: error?.message ?? 'no session returned' }, 'Sign-in failed');
    throw new InvalidCredentialsError();
  }

  // Resolving the profile here means a credential that authenticates but has no
  // SetuX identity fails at login rather than at the first protected call.
  const profile = await resolveProfile(data.user.id);

  return {
    user: { id: data.user.id, email: data.user.email },
    profile: { role: profile.role, onboardingStatus: profile.onboardingStatus },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null,
    },
  };
};

/**
 * Revokes the session behind an access token.
 *
 * Best-effort by design: an absent or already-invalid token still yields a
 * successful logout, because the caller's intent — "end my session" — is
 * satisfied either way, and reporting a failure would only invite the client to
 * keep local state it should be discarding.
 */
export const signOut = async (accessToken: string): Promise<void> => {
  if (!accessToken) {
    return;
  }

  try {
    const { error } = await createIsolatedAuthClient().auth.admin.signOut(accessToken, 'local');

    if (error) {
      logger.warn({ reason: error.message }, 'Session revocation reported an error');
    }
  } catch (err) {
    // A transport failure must not turn into a 500: the client is discarding
    // its session either way, and an error here would only encourage it to
    // hold on to state it should be dropping.
    logger.warn({ err }, 'Session revocation could not be completed');
  }
};

/**
 * Registers a new citizen account.
 *
 * The role is fixed to CITIZEN here, in server code. It is not read from the
 * request and there is nowhere in the contract to put it: government access is
 * provisioned through the controlled process instead (auth-api.md §11,
 * authentication-and-rbac.md §16). This is the single most important line in
 * the function.
 *
 * Identity and profile are created together. If the profile write fails, the
 * auth user just created is deleted again, because an identity that can
 * authenticate but resolves to no role is an orphan that fails every protected
 * request (Phase 3 §43).
 *
 * @throws {ConflictError} an account already exists for this email
 */
export const signUpCitizen = async (params: {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
}): Promise<SignupPayload> => {
  const client = createIsolatedAuthClient();

  const { data, error } = await client.auth.admin.createUser({
    email: params.email,
    password: params.password,
    // Confirmed on creation: `supabase/config.toml` sets
    // `enable_confirmations = false`, so there is no verification mail to wait
    // for in this prototype.
    email_confirm: true,
    // Display data only. Supabase exposes user_metadata to the client and it is
    // user-editable, so nothing here may ever inform an authorization decision.
    user_metadata: { full_name: params.fullName },
  });

  if (error || !data.user) {
    logger.warn({ reason: error?.message }, 'Account creation failed');

    // Supabase reports an existing address as a 422/duplicate. Reported as a
    // conflict without echoing the provider's wording.
    throw new ConflictError('An account with this email already exists.');
  }

  const userId = data.user.id;

  try {
    const profile = await insertProfile({
      id: userId,
      email: params.email,
      // Server-controlled. Never `params.role` — there is no such field.
      role: USER_ROLES.CITIZEN,
    });

    return {
      userId: profile.id,
      email: profile.email,
      role: profile.role,
    };
  } catch (err) {
    // Roll the identity back so a retry is not blocked by a half-created
    // account that can log in but has no role.
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    logger.error({ userId, err }, 'Profile creation failed; auth identity rolled back');
    throw err;
  }
};
