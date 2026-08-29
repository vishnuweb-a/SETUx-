import type { Enums } from '../../database/index.js';

/**
 * The SetuX application roles.
 *
 * Sourced from the `public.user_role` enum so the type cannot drift from the
 * database. `docs/AUTH/authentication-and-rbac.md` §5 additionally describes an
 * ADMIN role; the Phase 2 schema and `docs/API/auth-api.md` §3 define exactly
 * two for the MVP, and the database is the authority.
 */
export type UserRole = Enums<'user_role'>;

export const USER_ROLES = {
  CITIZEN: 'CITIZEN',
  GOVERNMENT_OFFICER: 'GOVERNMENT_OFFICER',
} as const satisfies Record<UserRole, UserRole>;

/** Onboarding progress, used by the frontend to pick a landing route. */
export type OnboardingStatus = Enums<'onboarding_status'>;

/**
 * The trusted authentication context attached to a request.
 *
 * Every field is derived server-side: `userId` and `email` come from the
 * verified access token, `role` and `onboardingStatus` from the `profiles` row
 * that token resolves to. Nothing here is ever read from a request body,
 * query string or client header (auth-api.md §24, rbac §26).
 */
export interface AuthContext {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly onboardingStatus: OnboardingStatus;
}

/** The SetuX profile backing an authenticated identity. */
export interface Profile {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly onboardingStatus: OnboardingStatus;
}

/** Response payload of `GET /api/v1/auth/me` (auth-api.md §16). */
export interface CurrentUserPayload {
  readonly user: { readonly id: string; readonly email: string };
  readonly profile: {
    readonly role: UserRole;
    readonly onboardingStatus: OnboardingStatus;
  };
}

/**
 * Response payload of `POST /api/v1/auth/login`
 * (authentication-and-rbac.md §9).
 *
 * The session tokens are returned to the caller because the browser is the
 * session holder; they are never logged or persisted server-side.
 */
export interface LoginPayload {
  readonly user: { readonly id: string; readonly email: string };
  readonly profile: {
    readonly role: UserRole;
    readonly onboardingStatus: OnboardingStatus;
  };
  readonly session: {
    readonly accessToken: string;
    readonly refreshToken: string;
    /** Unix seconds; `null` when the Auth server did not supply one. */
    readonly expiresAt: number | null;
  };
}

/**
 * Response payload of `POST /api/v1/auth/signup` (auth-api.md §12).
 *
 * `role` is echoed so the client can confirm what was actually created — which
 * is always CITIZEN, whatever the client may have hoped for.
 */
export interface SignupPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
}
