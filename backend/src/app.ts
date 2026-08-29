import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import {
  apiRateLimiter,
  errorHandler,
  notFoundHandler,
  requestContext,
  requestLogger,
} from './middleware/index.js';
import { apiRouter } from './routes/index.js';

const JSON_BODY_LIMIT = '1mb';

/**
 * Builds the Express application.
 *
 * Kept free of side effects (no listening, no process handlers) so tests can
 * mount it directly with supertest.
 */
export const createApp = (): Express => {
  const app = express();

  // Trust the reverse proxy in production so client IPs and protocol are correct.
  if (config.isProduction) {
    app.set('trust proxy', 1);
  }
  app.disable('x-powered-by');

  // Correlation id first: every later middleware and log line depends on it.
  app.use(requestContext);

  app.use(helmet());
  app.use(cors({ origin: config.http.corsOrigins, credentials: true }));

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  if (!config.isTest) {
    app.use(requestLogger);
  }

  app.use(config.http.apiPrefix, apiRateLimiter, apiRouter);

  // Terminal handlers, in order.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
