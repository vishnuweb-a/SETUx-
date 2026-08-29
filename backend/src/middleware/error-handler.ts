import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';
import { AppError, ERROR_CODES, ValidationError } from '../shared/errors/index.js';
import { logger } from '../shared/logger/index.js';
import { errorBody } from '../shared/utils/index.js';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * The single exit point for every backend failure.
 *
 * Deliberate `AppError`s are reported with their own code and message.
 * Anything else is logged in full and reported to the client as a generic
 * INTERNAL_ERROR — internal details must never reach the response body.
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn(
      { requestId, code: err.code, statusCode: err.statusCode, path: req.originalUrl },
      err.message,
    );

    res.status(err.statusCode).json(
      errorBody({
        code: err.code,
        message: err.message,
        requestId,
        details: err instanceof ValidationError ? err.details : undefined,
      }),
    );
    return;
  }

  logger.error(
    { requestId, path: req.originalUrl, err },
    'Unhandled error while processing request',
  );

  res.status(500).json(
    errorBody({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: config.isProduction ? GENERIC_MESSAGE : String(err),
      requestId,
    }),
  );
};
