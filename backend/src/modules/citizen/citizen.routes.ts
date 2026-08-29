import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { asyncHandler, successBody } from '../../shared/utils/index.js';
import { USER_ROLES } from '../auth/auth.types.js';

/**
 * Citizen-only API surface.
 *
 * Phase 3 exposes a single endpoint whose only job is to prove the
 * authorization chain end to end: authenticate → resolve role → require
 * CITIZEN. Citizen business functionality belongs to later phases.
 */
export const citizenRouter = Router();

citizenRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.CITIZEN));

citizenRouter.get('/dashboard', (req, res) => {
  if (!req.auth) throw new MissingTokenError();

  res.status(HTTP_STATUS.OK).json(
    successBody({
      area: 'CITIZEN',
      userId: req.auth.userId,
      onboardingStatus: req.auth.onboardingStatus,
    }),
  );
});
