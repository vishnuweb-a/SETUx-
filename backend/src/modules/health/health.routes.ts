import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/index.js';
import { handleGetHealth } from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(handleGetHealth));
