import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { HTTP_STATUS } from '../shared/constants/index.js';
import { ERROR_CODES } from '../shared/errors/index.js';
import { errorBody } from '../shared/utils/index.js';

/**
 * Baseline abuse protection for the versioned API surface.
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(
      errorBody({
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests. Please try again later.',
        requestId: req.requestId ?? 'unknown',
      }),
    );
  },
});
