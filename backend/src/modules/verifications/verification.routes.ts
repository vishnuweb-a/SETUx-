import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleGetApplicationVerification,
  handleStartApplicationVerification,
} from './verification.controller.js';
import {
  applicationVerificationParamsSchema,
  startVerificationBodySchema,
} from './verification.schema.js';

/**
 * Verification for one application —
 * `GET|POST /api/v1/applications/:applicationId/verification`.
 *
 * Singular, and one endpoint per verb. An application has exactly one
 * verification state, so this is a resource rather than a collection, and the
 * whole run is a single orchestrated action rather than a per-requirement call
 * the client would have to sequence. Letting a client verify requirements one
 * at a time would put the workflow's ordering in the browser (§19).
 *
 * There is deliberately no route to verify a NAMED requirement, and none to set
 * an outcome. Which requirements are evaluated comes from the service's
 * configuration; what each evaluates to comes from the rules.
 *
 * Mounted by the applications router, so it inherits that router's citizen
 * authentication and role gate. Ownership, onboarding and application state are
 * enforced again in the service, and the transition is guarded once more inside
 * the database function.
 */
export const applicationVerificationRoute = Router({ mergeParams: true });

applicationVerificationRoute.get(
  '/',
  validateRequest({ params: applicationVerificationParamsSchema }),
  asyncHandler(handleGetApplicationVerification),
);

applicationVerificationRoute.post(
  '/',
  validateRequest({
    params: applicationVerificationParamsSchema,
    body: startVerificationBodySchema,
  }),
  asyncHandler(handleStartApplicationVerification),
);
