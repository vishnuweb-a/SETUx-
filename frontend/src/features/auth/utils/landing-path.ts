import { USER_ROLES, type UserRole } from '../types/auth.types';

/**
 * The route a signed-in user belongs on, given the role the backend resolved.
 *
 * Navigation only. Reaching the path is not the same as being allowed to use
 * it: each destination is behind its own guard, and its data is behind backend
 * authorization (authentication-and-rbac.md §13).
 */
export const landingPathForRole = (role: UserRole): string =>
  role === USER_ROLES.GOVERNMENT_OFFICER ? '/government' : '/citizen';
