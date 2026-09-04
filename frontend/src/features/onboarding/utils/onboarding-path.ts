import type { OnboardingStatus, UserRole } from '@/features/auth';

/**
 * Route paths for the two onboarding flows.
 *
 * Kept beside the guards that consume them so a path is written once. Reaching
 * one of these routes is not the same as being able to complete it: each form's
 * endpoint enforces the role server-side (onboarding.md §6).
 */
export const ONBOARDING_PATHS = {
  CITIZEN: '/onboarding/citizen',
  GOVERNMENT_OFFICER: '/onboarding/government',
} as const satisfies Record<UserRole, string>;

/** The dashboards onboarding completion leads to (the Phase 3 routes). */
export const DASHBOARD_PATHS = {
  CITIZEN: '/citizen',
  GOVERNMENT_OFFICER: '/government',
} as const satisfies Record<UserRole, string>;

/** The onboarding form for a role. Navigation only. */
export const onboardingPathForRole = (role: UserRole): string => ONBOARDING_PATHS[role];

/** The dashboard for a role. Navigation only. */
export const dashboardPathForRole = (role: UserRole): string => DASHBOARD_PATHS[role];

/**
 * Where a signed-in user belongs right now, given role and onboarding status.
 *
 * The single expression of the Phase 4 routing state machine, so `/`, the login
 * screen and the guards cannot disagree about the destination (Phase 4 §13).
 */
export const landingPathForUser = (user: {
  readonly role: UserRole;
  readonly onboardingStatus: OnboardingStatus;
}): string =>
  user.onboardingStatus === 'COMPLETED'
    ? dashboardPathForRole(user.role)
    : onboardingPathForRole(user.role);
