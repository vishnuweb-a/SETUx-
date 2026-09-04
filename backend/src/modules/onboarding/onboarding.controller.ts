import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { successBody } from '../../shared/utils/index.js';
import type {
  CitizenOnboardingInput,
  CitizenOnboardingPatchInput,
  GovernmentOnboardingInput,
  GovernmentOnboardingPatchInput,
  OrganizationCodeParams,
} from './onboarding.schema.js';
import {
  getOnboardingProfile,
  getOnboardingStatus,
  getOrganizationDepartments,
  submitCitizenOnboarding,
  submitGovernmentOnboarding,
  updateCitizenOnboarding,
  updateGovernmentOnboarding,
} from './onboarding.service.js';

/**
 * HTTP layer for onboarding.
 *
 * Controllers here do three things and nothing else: read the trusted context,
 * hand the validated body to the service, and choose a status code. No
 * validation, no authorization decision and no persistence — those belong to
 * the middleware, the service and the repository respectively (AGENT.md §7).
 *
 * `req.auth` is read on every handler and is the *only* source of identity. A
 * `userId` or `role` in the body has nowhere to go: the schemas are `.strict()`
 * and would have rejected the request before it reached here.
 */

/**
 * Reads the authenticated context, or fails closed.
 *
 * Reaching a handler without a context would mean the route was wired without
 * `requireAuth`. Treating that as unauthenticated is the safe reading; treating
 * it as "no user, carry on" would run the handler with no owner.
 */
const requireAuthContext = (req: Request) => {
  if (!req.auth) {
    throw new MissingTokenError();
  }

  return req.auth;
};

/**
 * `GET /api/v1/onboarding/status` — whether this user still has to onboard
 * (onboarding.md §21).
 *
 * The route the frontend guard depends on. Its answer comes from `profiles` by
 * way of the verified token, so it cannot be influenced by local state.
 */
export const handleGetStatus = async (req: Request, res: Response): Promise<void> => {
  const auth = requireAuthContext(req);

  res.status(HTTP_STATUS.OK).json(successBody(getOnboardingStatus(auth)));
};

/**
 * `GET /api/v1/onboarding/profile` — the caller's saved onboarding data
 * (onboarding.md §23).
 */
export const handleGetProfile = async (req: Request, res: Response): Promise<void> => {
  const auth = requireAuthContext(req);
  const payload = await getOnboardingProfile(auth);

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/**
 * `GET /api/v1/onboarding/organizations/:code/departments` — the departments
 * registered under an organization code.
 *
 * Reference data only, and officer-only: a citizen has no reason to enumerate
 * government departments through this route.
 */
export const handleGetOrganizationDepartments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  requireAuthContext(req);
  const { code } = req.params as unknown as OrganizationCodeParams;
  const payload = await getOrganizationDepartments(code);

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/** `POST /api/v1/onboarding/citizen` — 201 on creation (onboarding.md §14). */
export const handleCitizenOnboarding = async (req: Request, res: Response): Promise<void> => {
  const auth = requireAuthContext(req);
  const payload = await submitCitizenOnboarding({
    auth,
    input: req.body as CitizenOnboardingInput,
  });

  res
    .status(HTTP_STATUS.CREATED)
    .json(successBody(payload, 'Citizen profile created successfully.'));
};

/** `PATCH /api/v1/onboarding/citizen` — 200 on update (onboarding.md §24, §37). */
export const handleCitizenOnboardingUpdate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const auth = requireAuthContext(req);
  const payload = await updateCitizenOnboarding({
    auth,
    input: req.body as CitizenOnboardingPatchInput,
  });

  res.status(HTTP_STATUS.OK).json(successBody(payload, 'Citizen profile updated successfully.'));
};

/** `POST /api/v1/onboarding/government` — 201 on creation (onboarding.md §20). */
export const handleGovernmentOnboarding = async (req: Request, res: Response): Promise<void> => {
  const auth = requireAuthContext(req);
  const payload = await submitGovernmentOnboarding({
    auth,
    input: req.body as GovernmentOnboardingInput,
  });

  res
    .status(HTTP_STATUS.CREATED)
    .json(successBody(payload, 'Government profile created successfully.'));
};

/** `PATCH /api/v1/onboarding/government` — 200 on update (onboarding.md §25). */
export const handleGovernmentOnboardingUpdate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const auth = requireAuthContext(req);
  const payload = await updateGovernmentOnboarding({
    auth,
    input: req.body as GovernmentOnboardingPatchInput,
  });

  res
    .status(HTTP_STATUS.OK)
    .json(successBody(payload, 'Government profile updated successfully.'));
};
