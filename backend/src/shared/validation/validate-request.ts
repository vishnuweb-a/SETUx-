import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z, ZodType } from 'zod';
import { ValidationError } from '../errors/index.js';

/** The request parts a route may validate. */
export interface RequestSchemas {
  readonly body?: ZodType;
  readonly query?: ZodType;
  readonly params?: ZodType;
}

/**
 * Validates the request against the supplied Zod schemas before the controller
 * runs, so handlers can trust their input.
 *
 * Parsed values replace `req.body` and `req.params` (coercions and defaults are
 * applied). `req.query` is a getter in Express 5 and cannot be reassigned, so
 * it is validated but left in place — read query values through the schema at
 * the call site when coercion matters.
 */
export const validateRequest = (schemas: RequestSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: z.core.$ZodIssue[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else issues.push(...prefixIssues(result.error, 'body'));
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) req.params = result.data as Request['params'];
      else issues.push(...prefixIssues(result.error, 'params'));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) issues.push(...prefixIssues(result.error, 'query'));
    }

    if (issues.length > 0) {
      next(new ValidationError('The request payload is invalid.', toFieldErrors(issues)));
      return;
    }

    next();
  };
};

const prefixIssues = (error: z.ZodError, source: string): z.core.$ZodIssue[] =>
  error.issues.map((issue) => ({ ...issue, path: [source, ...issue.path] }));

/** Flattens Zod issues into a client-safe `{ field: message }` map. */
const toFieldErrors = (issues: readonly z.core.$ZodIssue[]): Record<string, string> =>
  Object.fromEntries(issues.map((issue) => [issue.path.join('.'), issue.message]));
