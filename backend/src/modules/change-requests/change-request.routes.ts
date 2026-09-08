import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import { handleGetChangeImpact } from '../change-impact/index.js';
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
 * FOUR ROUTES, AND NO OTHERS.
 *
 *   POST   /drafts               create          (Phase 4)
 *   GET    /drafts/:id           resume          (Phase 4)
 *   PATCH  /drafts/:id           revise          (Phase 4)
 *   GET    /drafts/:id/impact    detect impact   (Phase 5)
 *
 * The Phase 5 route is mounted HERE rather than on a router of its own, and
 * that is a deliberate choice about what the resource is. Impact is not a thing
 * a citizen owns — it is a computed property OF A DRAFT, addressed as a
 * sub-resource of the draft it describes, and it must be governed by exactly
 * the same gate. Giving it a separate mount would be giving it a separate gate
 * that could drift from this one.
 *
 * It is a GET, and it is safe: nothing behind it writes. No target is created,
 * no consent derived, no status moved, no government record touched. There is
 * therefore still no verb on this router that could mutate a citizen's record.
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

/**
 * Phase 5 — which of the citizen's OTHER records this correction affects.
 *
 * Reuses `changeRequestIdParamsSchema` rather than declaring a second one, so a
 * malformed id is a 400 here for exactly the reason and with exactly the
 * message it is on the three routes above. Two schemas for one path parameter
 * is how the two answers drift apart.
 *
 * No body schema, because a GET has no body — and that absence is the security
 * property: there is no parameter through which a caller could supply a source
 * record type, a field list, an impact level or a target. Every one of those is
 * read server-side from the stored draft and the rule table (task §7).
 *
 * `noQuerySchema` still applies: this endpoint takes no filter and no page, and
 * `?citizenId=…` must be a visible 400 rather than a parameter someone believes
 * worked.
 */
changeRequestsRouter.get(
  '/drafts/:changeRequestId/impact',
  validateRequest({ params: changeRequestIdParamsSchema, query: noQuerySchema }),
  asyncHandler(handleGetChangeImpact),
);
