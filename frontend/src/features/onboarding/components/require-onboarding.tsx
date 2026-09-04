import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { dashboardPathForRole, onboardingPathForRole } from '../utils/onboarding-path';

/**
 * Sends an authenticated user who has not completed onboarding to their
 * onboarding form, and lets everyone else through.
 *
 * Mounted *inside* `ProtectedRoute`, which has already resolved the session and
 * checked the role. Splitting the two keeps each guard answering one question —
 * "are you allowed here?" versus "are you finished setting up?" — instead of
 * growing one component that does both (Phase 4 §38).
 *
 * There is no loading branch here because there is nothing left to load: the
 * onboarding status arrives with the user from `/auth/me`, which
 * `ProtectedRoute` already waited for. That is what keeps the dashboard from
 * flashing while onboarding state is still unknown (Phase 4 §35).
 *
 * Like every browser guard, this is a UX control. A user who edits it out still
 * gets nothing: the backend authorizes each request independently.
 */
export function RequireOnboarding() {
  const { user } = useAuth();

  // Unreachable behind `ProtectedRoute`; handled rather than asserted so a
  // future re-wiring cannot turn it into a crash.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboardingStatus !== 'COMPLETED') {
    return <Navigate to={onboardingPathForRole(user.role)} replace />;
  }

  return <Outlet />;
}

/**
 * The mirror of {@link RequireOnboarding}: keeps an already-onboarded user out
 * of the onboarding forms.
 *
 * Without this, a completed user visiting `/onboarding/citizen` would be shown
 * a form whose submission the backend answers with 409 — a dead end. They are
 * sent to their dashboard instead (Phase 4 §40).
 *
 * Onboarding is not profile editing; revisiting these forms after completion
 * has no purpose in Phase 4.
 */
export function RequireIncompleteOnboarding() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboardingStatus === 'COMPLETED') {
    return <Navigate to={dashboardPathForRole(user.role)} replace />;
  }

  return <Outlet />;
}
