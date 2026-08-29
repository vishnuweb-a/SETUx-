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
    }
  }
}

export {};
