import { setSessionStorageMode, supabase } from '@/lib/supabase';
import { apiRequest } from '@/services/api-client';
import type {
  AuthUser,
  CurrentUserResponse,
  SignupInput,
  SignupResponse,
} from '../types/auth.types';

/**
 * Authentication operations.
 *
 * Sessions are held by the Supabase client; roles come from the SetuX backend.
 * The split is deliberate — Supabase answers "who is this?", SetuX answers
 * "what are they allowed to do?" (auth-api.md §37).
 */

/**
 * Signs in with a password.
 *
 * The credential goes to Supabase Auth directly so the SDK owns the resulting
 * session and can persist and refresh it. The password never touches SetuX
 * state, is never stored, and is never logged.
 */
export const signIn = async (
  email: string,
  password: string,
  rememberMe = true,
): Promise<void> => {
  // Chosen before the session is written so the SDK persists it to the right
  // place: localStorage survives a browser restart, sessionStorage ends with
  // the tab. This is the "Remember me" behaviour of the approved auth screen
  // (auth-api.md §25), expressed through the client's own persistence rather
  // than a custom token store.
  setSessionStorageMode(rememberMe);

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }
};

/**
 * Ends the session.
 *
 * Errors are swallowed: the caller is discarding its authenticated state
 * regardless, and a failure here must not leave the user stuck on a screen they
 * asked to leave.
 */
export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut().catch(() => undefined);
};

/** The current access token, or `null` when there is no session. */
export const getAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

/**
 * Fetches the authenticated user together with their server-resolved role.
 *
 * This call is what makes the role trustworthy: it is read from the backend,
 * which derives it from `profiles`, rather than from anything the browser holds
 * (auth-api.md §17).
 */
export const fetchCurrentUser = async (): Promise<AuthUser> => {
  const response = await apiRequest<CurrentUserResponse>('/auth/me');

  return {
    id: response.user.id,
    email: response.user.email,
    role: response.profile.role,
    onboardingStatus: response.profile.onboardingStatus,
  };
};

/**
 * Registers a new citizen account.
 *
 * Goes through the SetuX backend rather than `supabase.auth.signUp` so the
 * account and its SetuX profile are created together, under the server's
 * control. Registering directly against Supabase would produce an identity with
 * no profile — able to authenticate, but resolving to no role.
 *
 * The role is never sent: the backend assigns CITIZEN (auth-api.md §11).
 */
export const signUp = async (input: SignupInput): Promise<SignupResponse> =>
  apiRequest<SignupResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      confirmPassword: input.confirmPassword,
    }),
  });
