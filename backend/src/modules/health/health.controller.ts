import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import { getHealthStatus } from './health.service.js';

export const handleGetHealth = (_req: Request, res: Response): void => {
  res.status(HTTP_STATUS.OK).json(successBody(getHealthStatus(), 'Service is healthy'));
};
