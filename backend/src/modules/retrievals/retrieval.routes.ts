import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleCreateApplicationRetrieval,
  handleGetApplicationRetrievals,
} from './retrieval.controller.js';
import {
  applicationRetrievalParamsSchema,
  createRetrievalBodySchema,
} from './retrieval.schema.js';

/**
 * Retrievals for one application —
 * `GET|POST /api/v1/applications/:applicationId/retrievals`.
 *
 * Resource-oriented rather than provider-named: the citizen creates a
 * *retrieval*, and which provider serves it is SetuX's decision, derived from
 * the requirement's configured source. A `/digilocker/retrieve` route would
 * bake today's single connector into the URL and let the client name the
 * provider — exactly the coupling the connector boundary exists to prevent
 * (Phase 8 §22, government-connector.md §4).
 *
 * Mounted by the applications router, so it inherits that router's citizen
 * authentication and role gate. Ownership and consent are enforced again in the
 * service and once more in the database function.
 */
export const applicationRetrievalsRoute = Router({ mergeParams: true });

applicationRetrievalsRoute.get(
  '/',
  validateRequest({ params: applicationRetrievalParamsSchema }),
  asyncHandler(handleGetApplicationRetrievals),
);

applicationRetrievalsRoute.post(
  '/',
  validateRequest({ params: applicationRetrievalParamsSchema, body: createRetrievalBodySchema }),
  asyncHandler(handleCreateApplicationRetrieval),
);
