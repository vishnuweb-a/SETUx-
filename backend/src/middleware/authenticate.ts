import type { NextFunction, Request, Response } from 'express';
import { authenticate as authenticateToken } from '../modules/auth/auth.service.js';
import { MissingTokenError } from '../shared/errors/index.js';

const BEARER_PREFIX = 'bearer ';

/**
 * Extracts the access token from an `Authorization: Bearer <token>` header.
 *
 * Only this header is consulted. Query parameters and request-body fields are
 * deliberately not accepted as credential carriers: tokens in URLs leak into
 * access logs, proxies and browser history.
 */
const readBearerToken = (req: Request): string | null => {
  const header = req.header('authorization');

  if (!header?.toLowerCase().startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Rejects any request that does not carry a valid SetuX session, and attaches
 * the trusted {@link AuthContext} to `req.auth` for everything downstream.
 *
 * `req.auth` is assigned here and nowhere else, so a controller can rely on it
 * being server-derived. Client-supplied identity — a `role` in the body, a
 * `userId` in the query, an `X-User-ID` header — is never read
 * (auth-api.md §24, authentication-and-rbac.md §26).
 *
 * Failures are forwarded to the central error handler as 401s.
 */
export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = readBearerToken(req);

    if (!token) {
      throw new MissingTokenError();
    }

    req.auth = await authenticateToken(token);
    next();
  } catch (err) {
    next(err);
  }
};
