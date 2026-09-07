import { Router } from 'express';
import { requireAuth } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import {
  handleGetFieldPolicy,
  handleGetRecordTypeFieldPolicies,
} from './field-policy.controller.js';
import {
  fieldPolicyParamsSchema,
  recordTypeParamsSchema,
} from './field-policy.schema.js';

/**
 * Editable field policy routes
 * (Change & Correction Service, Phase 1).
 *
 * Authentication, and no role restriction — the same posture the service
 * catalogue takes, and for the same two reasons. The RLS policy on the table is
 * `field_policies_select_authenticated ... to authenticated`, so the database
 * grants these rows to any signed-in user rather than to citizens alone;
 * narrowing the API to CITIZEN would contradict the schema. And an officer
 * reviewing a correction needs to see the same rule the citizen was shown —
 * "why was this field editable?" is a question the review phase will have to
 * answer, and it cannot answer it from an endpoint it may not call.
 *
 * Mounted top-level rather than under the citizen router for the same reason
 * the catalogue is: this is configuration about record types, not a
 * citizen-scoped resource. There is no citizen in the request at all — no
 * parameter names one, and no response varies by who asks. Anonymous access is
 * still refused, because SetuX's own conventions require a session on every
 * route but health and auth, and because publishing the correction rules of the
 * government systems SetuX federates is not something to do unauthenticated.
 *
 * READ ONLY, structurally. No POST, PATCH, PUT or DELETE is declared on this
 * router — not disabled, not guarded, simply absent — so a client cannot write
 * a policy through the API even in principle. Policy rows reach the database
 * only through a migration, and the table carries no write RLS policy for
 * `authenticated` either. That is what makes the backend authoritative: the
 * frontend has no path to author editability, only to read it.
 *
 *   requireAuth → validateRequest(<schema>) → controller
 */
export const fieldPoliciesRouter = Router();

fieldPoliciesRouter.use(asyncHandler(requireAuth));

fieldPoliciesRouter.get(
  '/:recordType',
  validateRequest({ params: recordTypeParamsSchema }),
  asyncHandler(handleGetRecordTypeFieldPolicies),
);

// `fields` is a literal segment, so no record type can be read as one and no
// field key can be read as a record type.
fieldPoliciesRouter.get(
  '/:recordType/fields/:fieldKey',
  validateRequest({ params: fieldPolicyParamsSchema }),
  asyncHandler(handleGetFieldPolicy),
);
