import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { asyncHandler, successBody } from '../../shared/utils/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { reviewRouter } from '../reviews/index.js';

/**
 * Government-officer-only API surface.
 *
 * Mounted behind the same authentication middleware as the citizen router —
 * there is deliberately no separate government login path (Phase 3 §22). Only
 * the required role differs.
 *
 * Phase 11 mounts the review surface here, so every officer endpoint inherits
 * one authentication gate and one role gate rather than each re-declaring them.
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

// Phase 11 — the officer's queue, application detail and decision. The router
// is mounted after the role gate above, so nothing inside it is reachable by a
// citizen or an anonymous caller.
governmentRouter.use('/review', reviewRouter);
