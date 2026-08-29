import pino from 'pino';
import { config } from '../../config/index.js';

/**
 * Structured application logger.
 *
 * `redact` is a safety net, not a licence to log sensitive values: per
 * `docs/SECURITY/security-design.md`, credentials, tokens and full government
 * IDs must never be passed to the logger in the first place.
 */
export const logger = pino({
  level: config.logging.level,
  base: { service: config.serviceName },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  ...(config.isProduction ? {} : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});

export type Logger = typeof logger;
