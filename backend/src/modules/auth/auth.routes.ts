import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { authRateLimiter } from '../../middleware/rate-limit.js';
import { validateRequest } from '../../shared/validation/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import {
  handleGetCurrentUser,
  handleLogin,
  handleLogout,
  handleSignup,
} from './auth.controller.js';
import { loginSchema, signupSchema } from './auth.schema.js';

/**
 * Authentication routes (auth-api.md §35, authentication-and-rbac.md §39).
 *
 * `/signup` and `/login` are public but rate-limited; `/me` and `/logout`
 * require a valid session.
 *
 * `/signup` creates CITIZEN accounts only. Government officers are provisioned
 * through the controlled seeding process, never self-service, because a role
 * that grants government access must not be selectable by the person
 * requesting it (auth-api.md §11, authentication-and-rbac.md §16).
 */
export const authRouter = Router();

authRouter.post(
  '/signup',
  authRateLimiter,
  validateRequest({ body: signupSchema }),
  asyncHandler(handleSignup),
);
authRouter.post('/login', authRateLimiter, validateRequest({ body: loginSchema }), asyncHandler(handleLogin));
authRouter.get('/me', asyncHandler(requireAuth), asyncHandler(handleGetCurrentUser));
authRouter.post('/logout', asyncHandler(requireAuth), asyncHandler(handleLogout));
