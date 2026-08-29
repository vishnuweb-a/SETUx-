import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards a rejected promise from an async handler to the error middleware.
 *
 * Express 5 already forwards rejections from async handlers, so this wrapper is
 * for handlers whose typing benefits from an explicit return, and for keeping
 * the intent visible at the route definition.
 */
export const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
};
