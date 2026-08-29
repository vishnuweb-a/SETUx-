import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns a correlation id to every request.
 *
 * The id is surfaced on the response header and in error payloads so a user can
 * quote it ("Reference: req_…") and a developer can find the matching logs.
 */
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length > 0 ? incoming : `req_${randomUUID()}`;

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
