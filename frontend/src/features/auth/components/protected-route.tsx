import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/feedback/loading-state';
import { useAuth } from '../hooks/use-auth';
import type { UserRole } from '../types/auth.types';

export interface ProtectedRouteProps {
  /**
   * Roles permitted to render this branch. Omit to require authentication
   * without restricting the role.
   */
  readonly allowedRoles?: readonly UserRole[];
}

/**
 * Gates a branch of the router on authentication and, optionally, role.
 *
 * This is a **user-experience** control, not a security boundary: it decides
 * what to render, and anyone can edit the JavaScript that runs it. Every route
 * it protects is independently enforced by the backend, which is what actually
 * denies access (authentication-and-rbac.md §31–§33).
 *
 * The four states it distinguishes are the ones Phase 3 §20 requires:
 * LOADING, UNAUTHENTICATED, AUTHENTICATED-with-wrong-role, and AUTHENTICATED.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  // Nothing protected renders until the session is resolved, so a signed-in
  // user reloading a page is never flashed the login screen, and protected
  // content is never flashed to someone who turns out to be signed out.
  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    // `state.from` lets the login screen return the user where they were going.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
