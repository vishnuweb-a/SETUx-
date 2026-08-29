import type { AuthContext } from '../modules/auth/auth.types.js';

/**
 * Express request augmentation.
 *
 * Kept deliberately small: properties are added here only when a middleware in
 * this repository actually populates them.
 */
declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by `requestContext`; echoed in error responses. */
      requestId: string;

      /**
       * Trusted authentication context, set by `requireAuth` and by nothing
       * else. Optional because it is absent on public routes; handlers behind
       * `requireAuth` can rely on it being present.
       */
      auth?: AuthContext;
    }
  }
}

export {};
