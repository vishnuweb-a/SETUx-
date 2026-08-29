import { Router } from 'express';
import { handleGetHealth } from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', handleGetHealth);
