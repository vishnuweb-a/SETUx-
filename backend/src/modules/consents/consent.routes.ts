import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleDenyConsent,
  handleGetApplicationConsents,
  handleGrantConsent,
} from './consent.controller.js';
import {
  applicationConsentParamsSchema,
  consentDecisionBodySchema,
  consentIdParamsSchema,
} from './consent.schema.js';

/**
 * Consent decisions — `POST /api/v1/consents/:consentId/{grant,deny}`.
 *
 * Grant and deny are separate endpoints rather than one endpoint taking a
 * decision in the body. The decision is the whole point of the request, so it
 * belongs in the URL where it cannot be defaulted, coerced, or mistyped into
 * the wrong answer (api-specification.md §123 prefers explicit action
 * endpoints for exactly this).
 *
 * Ownership is enforced in the service and again in the database function; the
 * role gate here only keeps officers off a citizen action.
 */
export const consentsRouter = Router();
consentsRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.CITIZEN));
consentsRouter.post(
  '/:consentId/grant',
  validateRequest({ params: consentIdParamsSchema, body: consentDecisionBodySchema }),
  asyncHandler(handleGrantConsent),
);
consentsRouter.post(
  '/:consentId/deny',
  validateRequest({ params: consentIdParamsSchema, body: consentDecisionBodySchema }),
  asyncHandler(handleDenyConsent),
);

/**
 * The read side lives under the application it belongs to
 * (`GET /api/v1/applications/:applicationId/consents`), as
 * `api-specification.md` §17.1 specifies. It is mounted by the applications
 * router, which already carries the citizen auth and role gate.
 */
export const applicationConsentsRoute = Router({ mergeParams: true });
applicationConsentsRoute.get(
  '/',
  validateRequest({ params: applicationConsentParamsSchema }),
  asyncHandler(handleGetApplicationConsents),
);
