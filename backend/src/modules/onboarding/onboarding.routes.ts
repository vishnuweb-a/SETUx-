import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  handleCitizenOnboarding,
  handleCitizenOnboardingUpdate,
  handleGetOrganizationDepartments,
  handleGetProfile,
  handleGetStatus,
  handleGovernmentOnboarding,
  handleGovernmentOnboardingUpdate,
} from './onboarding.controller.js';
import {
  citizenOnboardingPatchSchema,
  citizenOnboardingSchema,
  governmentOnboardingPatchSchema,
  governmentOnboardingSchema,
  organizationCodeParamsSchema,
} from './onboarding.schema.js';

/**
 * Onboarding routes (onboarding.md §36).
 *
 * Every route requires a session — there is no public onboarding endpoint,
 * because onboarding attaches data to an identity and an anonymous caller has
 * none (onboarding.md §32).
 *
 * The middleware chain follows onboarding.md §33 exactly:
 *
 *   requireAuth → requireRole(<role>) → validateRequest(<schema>) → controller
 *
 * `requireRole` is what makes a citizen's POST to `/government` a 403 before
 * any business logic runs, and the reverse likewise. The service repeats the
 * check so it is safe independently of how it is wired.
 */
export const onboardingRouter = Router();

// Applies to every route below: status and profile are open to any
// authenticated user, whatever their role.
onboardingRouter.use(asyncHandler(requireAuth));

onboardingRouter.get('/status', asyncHandler(handleGetStatus));
onboardingRouter.get('/profile', asyncHandler(handleGetProfile));

// -----------------------------------------------------------------------------
// Citizen
// -----------------------------------------------------------------------------
onboardingRouter.post(
  '/citizen',
  requireRole(USER_ROLES.CITIZEN),
  validateRequest({ body: citizenOnboardingSchema }),
  asyncHandler(handleCitizenOnboarding),
);

onboardingRouter.patch(
  '/citizen',
  requireRole(USER_ROLES.CITIZEN),
  validateRequest({ body: citizenOnboardingPatchSchema }),
  asyncHandler(handleCitizenOnboardingUpdate),
);

// -----------------------------------------------------------------------------
// Government officer
// -----------------------------------------------------------------------------
// Officer-only, including the department lookup: a citizen has no reason to
// enumerate government departments, so the route is not offered to them.
onboardingRouter.get(
  '/organizations/:code/departments',
  requireRole(USER_ROLES.GOVERNMENT_OFFICER),
  validateRequest({ params: organizationCodeParamsSchema }),
  asyncHandler(handleGetOrganizationDepartments),
);

onboardingRouter.post(
  '/government',
  requireRole(USER_ROLES.GOVERNMENT_OFFICER),
  validateRequest({ body: governmentOnboardingSchema }),
  asyncHandler(handleGovernmentOnboarding),
);

onboardingRouter.patch(
  '/government',
  requireRole(USER_ROLES.GOVERNMENT_OFFICER),
  validateRequest({ body: governmentOnboardingPatchSchema }),
  asyncHandler(handleGovernmentOnboardingUpdate),
);
