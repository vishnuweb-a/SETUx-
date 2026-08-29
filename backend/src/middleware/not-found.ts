import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../shared/errors/index.js';

/**
 * Terminal route matcher: converts an unmatched path into a `NotFoundError` so
 * it flows through the same error handler as every other failure.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
};
