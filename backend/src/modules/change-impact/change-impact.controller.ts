import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { successBody } from '../../shared/utils/index.js';
import type { ChangeRequestIdParams } from '../change-requests/change-request.schema.js';
import { getChangeImpact } from './change-impact.service.js';

/**
 * HTTP layer for dependency & impact detection
 * (Change & Correction Service, Phase 5).
 *
 * One handler, one verb, one status code. The controller reads validated input,
 * calls the service and returns its answer; no authorization decision is taken
 * here — whether a draft's impact may be read is a property of the service's
 * checks and the repository's predicates, never of the handler (AGENT.md §7).
 *
 * `req.auth` is populated by `requireAuth` from a verified access token and is
 * the only place the citizen identity comes from. No handler reads `req.body`,
 * because there is no body: a forged `citizenId`, a claimed impact level or an
 * invented target has nowhere to land.
 */

/**
 * `GET /api/v1/change-requests/drafts/:changeRequestId/impact`
 *
 * WHY GET RATHER THAN POST. The task offered both. GET is correct here because
 * every property that distinguishes the two applies:
 *
 *   - It is genuinely SAFE. Nothing behind this handler writes — not a target,
 *     not a consent, not a status, not a government record. The repository has
 *     no write statement at all.
 *   - It is IDEMPOTENT and deterministic: the same draft returns the same
 *     analysis, so a retry, a refresh or a prefetch is free of consequence.
 *   - It takes no input beyond the resource it addresses, so there is nothing a
 *     body would carry.
 *
 * A POST would tell every reader — and every intermediary — that calling this
 * endpoint does something, which is exactly the impression this phase must not
 * give.
 *
 * 200 with the analysis. Another citizen's draft is a 404 here,
 * indistinguishable from an id that never existed; a draft with no detectable
 * impact is a 200 with an empty `impacts` array, because "nothing else is
 * affected" is an answer, not a missing resource.
 */
export const handleGetChangeImpact = async (req: Request, res: Response): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const { changeRequestId } = req.params as unknown as ChangeRequestIdParams;
  const analysis = await getChangeImpact(req.auth, changeRequestId);

  res.status(HTTP_STATUS.OK).json(successBody(analysis));
};
