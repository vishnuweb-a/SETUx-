import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../shared/utils/index.js';
import { validateRequest } from '../../shared/validation/index.js';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  handleGetCitizenRecord,
  handleListCitizenRecords,
} from './citizen-record.controller.js';
import { noQuerySchema, recordIdParamsSchema } from './citizen-record.schema.js';

/**
 * Citizen record registry routes
 * (Change & Correction Service, Phase 2).
 *
 * Authentication AND the CITIZEN role, unlike the Phase 1 field policy router.
 * The difference is the resource, not a change of mind: a field policy is
 * configuration about a KIND of record and reads identically for everyone, so
 * it is served to any signed-in user. A citizen record is personal data about
 * ONE person, so it takes the posture `applications` takes —
 * `requireAuth` + `requireRole(CITIZEN)` — and the service re-asserts both
 * (arch §1.1: role gating happens twice).
 *
 * An officer is refused here, and that is deliberate rather than an oversight.
 * An officer's authority over a citizen's record arises from a CHANGE TARGET
 * routed to their department (arch §4.6, §8), and no change target exists yet.
 * Granting officers a citizen-record read now could only be approximated as
 * "any record whose authority is my department", which would expose the
 * education record of every citizen in SetuX to every Higher Education officer,
 * including citizens who have never requested a correction. The endpoint that
 * serves officers arrives with the relationship that justifies it — the same
 * reason the table carries no officer RLS policy.
 *
 * READ ONLY, structurally. No POST, PATCH, PUT or DELETE is declared on this
 * router — not disabled, not guarded, simply absent — so a client cannot create,
 * amend or remove a government record through the API even in principle. The
 * tables carry no write RLS policy either, so the browser's own Supabase client
 * cannot do it directly. Records reach the database through the migration and
 * the trusted demo provisioner alone (task §22).
 *
 * Mounted top-level at `/citizen-records` rather than under `/citizen`, for the
 * same reason `/applications` is: `/citizen` is the role-probe surface, while a
 * record is a first-class resource with its own lifecycle. The role gate is
 * carried by this router itself, so the mount point is not what makes it safe.
 *
 *   requireAuth → requireRole(CITIZEN) → validateRequest(params, query) → controller
 */
export const citizenRecordsRouter = Router();

citizenRecordsRouter.use(asyncHandler(requireAuth), requireRole(USER_ROLES.CITIZEN));

citizenRecordsRouter.get(
  '/',
  validateRequest({ query: noQuerySchema }),
  asyncHandler(handleListCitizenRecords),
);

citizenRecordsRouter.get(
  '/:recordId',
  validateRequest({ params: recordIdParamsSchema, query: noQuerySchema }),
  asyncHandler(handleGetCitizenRecord),
);
