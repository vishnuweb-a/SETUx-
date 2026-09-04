import { Router } from 'express';
import { authRouter } from '../modules/auth/index.js';
import { citizenRouter } from '../modules/citizen/index.js';
import { governmentRouter } from '../modules/government/index.js';
import { healthRouter } from '../modules/health/index.js';
import { onboardingRouter } from '../modules/onboarding/index.js';
import { servicesRouter } from '../modules/services/index.js';

/**
 * Versioned API surface, mounted at `config.http.apiPrefix`.
 *
 * Feature routers are registered here by their own phase. Each router owns its
 * own authentication and authorization requirements.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/onboarding', onboardingRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/citizen', citizenRouter);
apiRouter.use('/government', governmentRouter);
