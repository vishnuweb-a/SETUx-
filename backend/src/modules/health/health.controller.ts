import type { Request, Response } from 'express';
import { successBody } from '../../shared/utils/index.js';
import { getHealthStatus } from './health.service.js';

export const handleGetHealth = (_req: Request, res: Response): void => {
  res.status(200).json(successBody(getHealthStatus(), 'Service is healthy'));
};
