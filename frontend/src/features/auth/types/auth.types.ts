/**
 * Authentication types shared across the auth feature.
 *
 * `UserRole` mirrors the `public.user_role` database enum, which is the
 * authority for role values (`docs/API/auth-api.md` §3).
 */

export type UserRole = 'CITIZEN' | 'GOVERNMENT_OFFICER';

export const USER_ROLES = {
  CITIZEN: 'CITIZEN',
  GOVERNMENT_OFFICER: 'GOVERNMENT_OFFICER',
} as const satisfies Record<UserRole, UserRole>;

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

/**
 * The authenticated user as the backend reports them.
 *
 * This is the only role the UI ever displays. It arrives from `GET /auth/me`,
 * which resolves it server-side from `profiles.role` — the browser never
 * decides what role it holds.
 */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly onboardingStatus: OnboardingStatus;
}

/** Payload of `GET /api/v1/auth/me` (auth-api.md §16). */
export interface CurrentUserResponse {
  readonly user: { readonly id: string; readonly email: string };
  readonly profile: {
    readonly role: UserRole;
    readonly onboardingStatus: OnboardingStatus;
  };
}

/**
 * Resolution state of the single authentication context.
 *
 * `loading` is a distinct state rather than "not authenticated yet" so guards
 * can wait instead of bouncing a signed-in user to the login screen on reload
 * (Phase 3 §20, §25).
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** Why the session ended, when the UI needs to explain itself. */
export type SessionEndReason = 'expired' | 'signed-out' | null;

/** What the register form collects (auth-api.md §10). */
export interface SignupInput {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
}

/**
 * Payload of `POST /api/v1/auth/signup` (auth-api.md §12).
 *
 * `role` is whatever the server actually created — always CITIZEN. It is
 * displayed, never used to decide anything.
 */
export interface SignupResponse {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
}
