import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/feedback/loading-state';
import { landingPathForRole, useAuth } from '@/features/auth';

/**
 * Sends a visitor at `/` wherever their authentication state belongs.
 *
 * Waits for the session to resolve before deciding, so a signed-in user
 * reloading the app is never bounced to the login screen on the way to their
 * own dashboard.
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

  return <Navigate to={user ? landingPathForRole(user.role) : '/login'} replace />;
}
