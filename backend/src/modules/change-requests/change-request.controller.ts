import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { successBody } from '../../shared/utils/index.js';
import {
  createChangeDraft,
  getChangeDraft,
  updateChangeDraft,
} from './change-request.service.js';
import type {
  ChangeRequestIdParams,
  CreateChangeDraftInput,
  UpdateChangeDraftInput,
} from './change-request.schema.js';

/**
 * HTTP layer for the change draft
 * (Change & Correction Service, Phase 4).
 *
 * Controllers read validated input, call the service and choose a status code.
 * No authorization decision is taken here: whether a draft may be created,
 * read or revised is a property of the service's checks and the repository's
 * predicates, never of the handler (AGENT.md §7).
 *
 * `req.auth` is populated by `requireAuth` from a verified access token, and it
 * is the only place the citizen identity comes from. Note that no handler reads
 * `req.body` for anything resembling an owner — there is no such key in any
 * schema, so a forged `citizenId` has nowhere to land.
 */

/**
 * `POST /api/v1/change-requests/drafts` — create a draft correction request.
 *
 * 201 with the created draft, whose fields carry both the server-taken snapshot
 * of the source value and what the citizen proposed. Returning the whole draft
 * rather than just an id is what lets the frontend adopt the server's answer as
 * truth immediately, rather than rendering its own optimistic version of a
 * request that has authorization rules the client cannot evaluate.
 *
 * The citizen's government record is NOT modified by this request. Nothing
 * reachable from this handler writes to `citizen_records` or
 * `citizen_record_fields`.
 */
export const handleCreateChangeDraft = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const input = req.body as CreateChangeDraftInput;
  const draft = await createChangeDraft(req.auth, input);

  res.status(HTTP_STATUS.CREATED).json(successBody(draft));
};

/**
 * `GET /api/v1/change-requests/drafts/:changeRequestId` — one draft.
 *
 * The endpoint that makes a draft survive a refresh: the values the citizen
 * entered come back from the database rather than from navigation state, so
 * reloading the page or returning to the URL later restores the work rather
 * than losing it.
 *
 * Another citizen's draft is a 404 here, indistinguishable from an id that
 * never existed.
 */
export const handleGetChangeDraft = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const { changeRequestId } = req.params as unknown as ChangeRequestIdParams;
  const draft = await getChangeDraft(req.auth, changeRequestId);

  res.status(HTTP_STATUS.OK).json(successBody(draft));
};

/**
 * `PATCH /api/v1/change-requests/drafts/:changeRequestId` — revise the values.
 *
 * The body carries the whole field set, and the service reconciles it against
 * what is stored. What it cannot carry is an old value: the snapshot each field
 * was created with is preserved server-side, so a revision changes what the
 * citizen is ASKING for and never what the source SAID.
 */
export const handleUpdateChangeDraft = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const { changeRequestId } = req.params as unknown as ChangeRequestIdParams;
  const input = req.body as UpdateChangeDraftInput;
  const draft = await updateChangeDraft(req.auth, changeRequestId, input);

  res.status(HTTP_STATUS.OK).json(successBody(draft));
};
