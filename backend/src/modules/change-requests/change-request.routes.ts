import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  handleCreateChangeDraft,
  handleGetChangeDraft,
  handleUpdateChangeDraft,
} from './change-request.controller.js';
import {
  changeRequestIdParamsSchema,
  createChangeDraftBodySchema,
  noQuerySchema,
  updateChangeDraftBodySchema,
} from './change-request.schema.js';

/**
 * Change draft routes
 * (Change & Correction Service, Phase 4).
 *
 * `requireAuth` + `requireRole(CITIZEN)`, the posture `applications` and the
 * Phase 2 record registry take, and the service re-asserts both (arch §1.1:
 * role gating happens twice).
 *
 * An officer is refused here, and it is deliberate rather than an omission. A
 * draft is a PRIVATE WORKING DOCUMENT: it has not been submitted, no target has
 * been routed and no department has been asked for anything. An officer reading
 * one would be reading a request the citizen has not made yet. Officer access
 * arrives with the change target that confers the authority (arch §4.6, §8),
 * which is Phase 9 and later — the same reason the tables carry no officer RLS
 * policy.
 *
 * Anonymous callers reach nothing: `requireAuth` runs before every route on
 * this router, not per-route where one could be added without it.
 *
 * THREE VERBS, AND NO OTHERS.
 *
 *   POST   /drafts        create
 *   GET    /drafts/:id    resume
 *   PATCH  /drafts/:id    revise
 *
 * There is deliberately no DELETE. Discarding a draft is not part of the Phase
 * 4 scope in `docs/PHASES/feature.md`, and nothing in the citizen flow needs it
 * — the acceptance criteria are creation, resumption and revision. Adding a
 * destructive verb because it would round out the CRUD set would be adding an
 * unrequested way to destroy a citizen's work; the phase that introduces
 * CANCELLED (arch §5) can add it with the lifecycle rules that make it
 * meaningful.
 *
 * Nothing on this router can modify a government record. The only write paths
 * behind these handlers target `change_requests` and `change_request_fields`;
 * `citizen_records` and `citizen_record_fields` are read and never written.
 *
 *   requireAuth → requireRole(CITIZEN) → validateRequest(params, body, query) → controller
 */
export const changeRequestsRouter = Router();

changeRequestsRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.CITIZEN));

changeRequestsRouter.post(
  '/drafts',
  validateRequest({ body: createChangeDraftBodySchema, query: noQuerySchema }),
  asyncHandler(handleCreateChangeDraft),
);

changeRequestsRouter.get(
  '/drafts/:changeRequestId',
  validateRequest({ params: changeRequestIdParamsSchema, query: noQuerySchema }),
  asyncHandler(handleGetChangeDraft),
);

changeRequestsRouter.patch(
  '/drafts/:changeRequestId',
  validateRequest({
    params: changeRequestIdParamsSchema,
    body: updateChangeDraftBodySchema,
    query: noQuerySchema,
  }),
  asyncHandler(handleUpdateChangeDraft),
);
