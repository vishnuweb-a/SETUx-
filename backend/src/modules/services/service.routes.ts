import { Router } from 'express';
import { requireAuth } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleGetService,
  handleGetServiceRequirements,
  handleListServiceDepartments,
  handleListServices,
} from './service.controller.js';
import { listServicesQuerySchema, serviceIdParamsSchema } from './service.schema.js';

/**
 * Service catalogue routes (api-specification.md §15).
 *
 * Authentication, and no role restriction. Two sources settle this rather than
 * convenience: the API flow in api-specification.md §26 places `GET /services`
 * after `GET /auth/me`, and the RLS policy the catalogue tables carry is
 * `services_select_authenticated ... to authenticated` — the database grants
 * these rows to any signed-in user, not to citizens alone. Narrowing the API to
 * CITIZEN would contradict the schema and would also block the officer screens
 * of later phases, which need to name the service an application belongs to.
 *
 * Being catalogue-wide is not a weakening: these tables hold configuration —
 * what SetuX offers and what it requires — and no citizen data at all
 * (catalogue migration header). What *is* enforced here is publication: only
 * ACTIVE services are ever selected, in the repository (Phase 5 §25).
 *
 * Onboarding is deliberately not gated at this layer. The browser routes the
 * catalogue behind `RequireOnboarding` so a half-onboarded citizen stays in
 * their form (Phase 5 §20), but an API that refused to name a scholarship until
 * a profile existed would be describing publication, not privacy.
 *
 *   requireAuth → validateRequest(<schema>) → controller
 */
export const servicesRouter = Router();

servicesRouter.use(asyncHandler(requireAuth));

servicesRouter.get(
  '/',
  validateRequest({ query: listServicesQuerySchema }),
  asyncHandler(handleListServices),
);

// Before `/:serviceId`, so the literal segment is not captured as an id.
servicesRouter.get('/departments', asyncHandler(handleListServiceDepartments));

servicesRouter.get(
  '/:serviceId',
  validateRequest({ params: serviceIdParamsSchema }),
  asyncHandler(handleGetService),
);

servicesRouter.get(
  '/:serviceId/requirements',
  validateRequest({ params: serviceIdParamsSchema }),
  asyncHandler(handleGetServiceRequirements),
);
