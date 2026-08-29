import { pinoHttp } from 'pino-http';
import { logger } from '../shared/logger/index.js';

/**
 * HTTP access logging bound to the same correlation id as the error handler.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
  customLogLevel: (_req, res, err) => {
    if (err !== undefined || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
