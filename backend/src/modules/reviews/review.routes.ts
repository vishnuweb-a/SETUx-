import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleGetReviewDashboard,
  handleGetReviewDetail,
  handleGetReviewQueue,
  handleSubmitReviewDecision,
} from './review.controller.js';
import {
  reviewApplicationParamsSchema,
  reviewDecisionBodySchema,
  reviewQueueQuerySchema,
} from './review.schema.js';

/**
 * The officer review surface, mounted under the government router.
 *
 * It therefore inherits that router's authentication and its
 * `requireRole(GOVERNMENT_OFFICER)` gate — an anonymous caller is refused with
 * a 401 and a citizen with a 403 before any handler here runs. The service
 * re-checks the role, the onboarding status and the department scope
 * independently, because a route mounted somewhere else later must still fail
 * closed.
 *
 * Three endpoints, which is the whole of Phase 11:
 *
 *   GET  /review                       the officer's own counts
 *   GET  /review/applications          the queue, filterable by status
 *   GET  /review/applications/:id      one application, with evidence
 *   POST /review/applications/:id/decision   the decision
 *
 * The decision is a POST to a sub-resource rather than a PATCH on the
 * application: it CREATES a review record — an accountable, append-only
 * artefact — and the status change is a consequence of that record existing.
 * Modelling it as a field update on the application would suggest the status is
 * the thing being edited, and would invite a client to send one.
 *
 * There is deliberately no route to set an application's status directly, and
 * none to edit or delete a recorded decision.
 */
export const reviewRouter = Router();

reviewRouter.get('/', asyncHandler(handleGetReviewDashboard));

reviewRouter.get(
  '/applications',
  validateRequest({ query: reviewQueueQuerySchema }),
  asyncHandler(handleGetReviewQueue),
);

reviewRouter.get(
  '/applications/:applicationId',
  validateRequest({ params: reviewApplicationParamsSchema }),
  asyncHandler(handleGetReviewDetail),
);

reviewRouter.post(
  '/applications/:applicationId/decision',
  validateRequest({
    params: reviewApplicationParamsSchema,
    body: reviewDecisionBodySchema,
  }),
  asyncHandler(handleSubmitReviewDecision),
);
