import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import { getHealthStatus } from './health.service.js';

/**
 * Returns 200 when everything the API depends on is reachable, and 503 when the
 * process is up but a dependency is not, so an orchestrator can act on the
 * status code alone.
 */
export const handleGetHealth = async (_req: Request, res: Response): Promise<void> => {
  const health = await getHealthStatus();

  const statusCode =
    health.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
  const message =
    health.status === 'healthy' ? 'Service is healthy' : 'Service is degraded';

  res.status(statusCode).json(successBody(health, message));
};
