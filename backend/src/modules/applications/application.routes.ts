import { Router } from 'express';
import { applicationConsentsRoute } from '../consents/index.js';
import { applicationRetrievalsRoute } from '../retrievals/index.js';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import { handleCreateApplication, handleGetApplication, handleListApplications, handleSubmitApplication, handleUpdateApplication } from './application.controller.js';
import { applicationIdParamsSchema, createApplicationBodySchema, listApplicationsQuerySchema, submitApplicationBodySchema, updateApplicationBodySchema } from './application.schema.js';

export const applicationsRouter = Router();
applicationsRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.CITIZEN));
applicationsRouter.get('/', validateRequest({ query: listApplicationsQuerySchema }), asyncHandler(handleListApplications));
applicationsRouter.post('/', validateRequest({ body: createApplicationBodySchema }), asyncHandler(handleCreateApplication));
applicationsRouter.get('/:applicationId', validateRequest({ params: applicationIdParamsSchema }), asyncHandler(handleGetApplication));
applicationsRouter.patch('/:applicationId', validateRequest({ params: applicationIdParamsSchema, body: updateApplicationBodySchema }), asyncHandler(handleUpdateApplication));
applicationsRouter.post('/:applicationId/submit', validateRequest({ params: applicationIdParamsSchema, body: submitApplicationBodySchema }), asyncHandler(handleSubmitApplication));
// Phase 7 — the consent requests belonging to one application. Nested here so
// it inherits this router's citizen authentication and role gate.
applicationsRouter.use('/:applicationId/consents', applicationConsentsRoute);
// Phase 8 — retrievals from the simulated government systems, performed only
// under a consent granted above. Same inherited auth and role gate.
applicationsRouter.use('/:applicationId/retrievals', applicationRetrievalsRoute);
