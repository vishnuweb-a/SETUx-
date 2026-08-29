import { Router } from 'express';
import { healthRouter } from '../modules/health/index.js';

/**
 * Versioned API surface, mounted at `config.http.apiPrefix`.
 *
 * Feature routers are registered here by their own phase. Phase 0 exposes only
 * the health check.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
