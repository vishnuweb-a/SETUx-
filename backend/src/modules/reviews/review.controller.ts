import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import {
  reviewApplicationParamsSchema,
  reviewDecisionBodySchema,
  reviewQueueQuerySchema,
} from './review.schema.js';
import { getReviewDashboard, getReviewDetail, getReviewQueue, submitReviewDecision } from './review.service.js';

export const handleGetReviewDashboard = async (req: Request, res: Response): Promise<void> => {
  res.status(HTTP_STATUS.OK).json(successBody(await getReviewDashboard(req.auth!)));
};

export const handleGetReviewQueue = async (req: Request, res: Response): Promise<void> => {
  const query = reviewQueueQuerySchema.parse(req.query);
  res.status(HTTP_STATUS.OK).json(successBody(await getReviewQueue(req.auth!, query)));
};

export const handleGetReviewDetail = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = reviewApplicationParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.OK).json(successBody(await getReviewDetail(req.auth!, applicationId)));
};

export const handleSubmitReviewDecision = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = reviewApplicationParamsSchema.parse(req.params);
  const body = reviewDecisionBodySchema.parse(req.body);

  res.status(HTTP_STATUS.CREATED).json(
    successBody(
      await submitReviewDecision(req.auth!, applicationId, body),
      body.decision === 'APPROVED'
        ? 'The application has been approved.'
        : 'The application has been rejected.',
    ),
  );
};
