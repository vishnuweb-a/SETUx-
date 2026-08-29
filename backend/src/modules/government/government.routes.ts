import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { asyncHandler, successBody } from '../../shared/utils/index.js';
import { USER_ROLES } from '../auth/auth.types.js';

/**
 * Government-officer-only API surface.
 *
 * Mounted behind the same authentication middleware as the citizen router —
 * there is deliberately no separate government login path (Phase 3 §22). Only
 * the required role differs.
 */
export const governmentRouter = Router();

governmentRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.GOVERNMENT_OFFICER));

governmentRouter.get('/dashboard', (req, res) => {
  if (!req.auth) throw new MissingTokenError();

  res.status(HTTP_STATUS.OK).json(
    successBody({
      area: 'GOVERNMENT_OFFICER',
      userId: req.auth.userId,
      onboardingStatus: req.auth.onboardingStatus,
    }),
  );
});
