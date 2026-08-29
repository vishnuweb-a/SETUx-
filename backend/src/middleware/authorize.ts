import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../modules/auth/auth.types.js';
import { ForbiddenError, MissingTokenError } from '../shared/errors/index.js';
import { logger } from '../shared/logger/index.js';

/**
 * Restricts a route to one or more SetuX roles.
 *
 * Must be mounted after {@link requireAuth}: it authorizes the context that
 * middleware established and never re-reads the request for identity. Roles are
 * compared explicitly with no hierarchy — an officer is not "a citizen plus
 * more" (authentication-and-rbac.md §6), so each route lists exactly the roles
 * it admits.
 *
 * @example
 * router.get('/dashboard', requireAuth, requireRole('GOVERNMENT_OFFICER'), handler);
 */
export const requireRole = (...allowedRoles: readonly [UserRole, ...UserRole[]]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;

    // Defensive: reaching here without a context means the route was wired
    // without `requireAuth`. Fail closed rather than treat it as authorized.
    if (!auth) {
      next(new MissingTokenError());
      return;
    }

    if (!allowedRoles.includes(auth.role)) {
      // An ACCESS_DENIED signal for the audit trail
      // (authentication-and-rbac.md §36). The user id is recorded; no token or
      // credential material is.
      logger.warn(
        {
          userId: auth.userId,
          actualRole: auth.role,
          requiredRoles: allowedRoles,
          path: req.originalUrl,
        },
        'Access denied by role check',
      );

      // The message names neither the required role nor the resource
      // (Phase 3 §18): an unauthorized caller learns only that they may not
      // perform this action.
      next(new ForbiddenError());
      return;
    }

    next();
  };
};
