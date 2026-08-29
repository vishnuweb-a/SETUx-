import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/index.js';
import { HTTP_STATUS } from '../shared/constants/index.js';
import { ERROR_CODES } from '../shared/errors/index.js';
import { errorBody } from '../shared/utils/index.js';

/**
 * Baseline abuse protection for the versioned API surface.
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(
      errorBody({
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests. Please try again later.',
        requestId: req.requestId ?? 'unknown',
      }),
    );
  },
});

/**
 * Stricter limit for credential-handling endpoints.
 *
 * Login and password-recovery routes are the ones worth brute-forcing, so they
 * get their own budget rather than sharing the general API allowance
 * (security-design.md §30, auth-api.md §31). Keyed by IP, which is what the
 * library derives by default.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  limit: config.rateLimit.auth.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Successful sign-ins do not count towards the budget, so a legitimate user
  // is never locked out by their own successful logins.
  skipSuccessfulRequests: true,
  /**
   * Keyed by account *and* client address, not by address alone.
   *
   * A purely IP-keyed limit is a denial-of-service vector wherever users share
   * an address — an office, a campus, a mobile carrier's NAT. One attacker
   * guessing passwords would exhaust the budget for everyone behind that
   * address. Combining the two means an attack on one account cannot lock
   * anybody else out, while brute-forcing a single account is still capped.
   *
   * The email is only a rate-limit bucket key; it grants nothing.
   */
  keyGenerator: (req) => {
    const body: unknown = req.body;
    const email =
      typeof body === 'object' && body !== null && typeof (body as { email?: unknown }).email === 'string'
        ? (body as { email: string }).email.trim().toLowerCase()
        : '';

    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  handler: (req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(
      errorBody({
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many attempts. Please try again later.',
        requestId: req.requestId ?? 'unknown',
      }),
    );
  },
});
