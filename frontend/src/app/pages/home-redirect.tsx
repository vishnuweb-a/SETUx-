import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/feedback/loading-state';
import { useAuth } from '@/features/auth';
import { landingPathForUser } from '@/features/onboarding';

/**
 * Sends a visitor at `/` wherever their authentication state belongs.
 *
 * Waits for the session to resolve before deciding, so a signed-in user
 * reloading the app is never bounced to the login screen on the way to their
 * own dashboard.
 *
 * The destination accounts for onboarding as well as role: a user who has not
 * finished setting up is sent to their form rather than to a dashboard the
 * guard would immediately redirect them away from (Phase 4 §13).
 */
export function HomeRedirect() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <LoadingState label="Loading SetuX…" />
      </div>
    );
  }

  return <Navigate to={user ? landingPathForUser(user) : '/login'} replace />;
}
