import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { MissingTokenError } from '../../shared/errors/index.js';
import { successBody } from '../../shared/utils/index.js';
import { getCitizenRecord, listCitizenRecords } from './citizen-record.service.js';
import type { RecordIdParams } from './citizen-record.schema.js';

/**
 * HTTP layer for the citizen record registry
 * (Change & Correction Service, Phase 2).
 *
 * Controllers read validated input, call the service and choose a status code.
 * No authorization decision is taken here: whether a record may be read is a
 * property of the query the repository runs, never of the handler (AGENT.md
 * §7).
 *
 * `req.auth` is populated by `requireAuth` from a verified access token. It is
 * the only place the citizen identity comes from — note that neither handler
 * reads `req.params`, `req.query` or `req.body` for anything resembling an
 * owner.
 */

/**
 * `GET /api/v1/citizen-records` — the caller's own record inventory.
 *
 * The whole list in one response rather than a page: a citizen has one record
 * per record type per source, and the Change Details entry screen needs all of
 * them at once to render the record chooser.
 */
export const handleListCitizenRecords = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const payload = await listCitizenRecords(req.auth);

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/**
 * `GET /api/v1/citizen-records/:recordId` — one record and its current values.
 *
 * Each field carries the Phase 1 policy governing it, so the change form can
 * explain why a field is locked rather than hiding it. The policy is read from
 * the policy table on every request; nothing about editability is stored on a
 * record or accepted from the caller.
 */
export const handleGetCitizenRecord = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.auth) throw new MissingTokenError();

  const { recordId } = req.params as unknown as RecordIdParams;
  const record = await getCitizenRecord(req.auth, recordId);

  res.status(HTTP_STATUS.OK).json(successBody(record));
};
