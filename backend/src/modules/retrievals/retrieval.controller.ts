import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import {
  applicationRetrievalParamsSchema,
  createRetrievalBodySchema,
} from './retrieval.schema.js';
import { createApplicationRetrieval, getApplicationRetrievals } from './retrieval.service.js';

export const handleGetApplicationRetrievals = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { applicationId } = applicationRetrievalParamsSchema.parse(req.params);
  res
    .status(HTTP_STATUS.OK)
    .json(successBody(await getApplicationRetrievals(req.auth!, applicationId)));
};

export const handleCreateApplicationRetrieval = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { applicationId } = applicationRetrievalParamsSchema.parse(req.params);
  const { requirementId } = createRetrievalBodySchema.parse(req.body);
  res
    .status(HTTP_STATUS.CREATED)
    .json(
      successBody(
        await createApplicationRetrieval(req.auth!, applicationId, requirementId),
        // "Retrieved", never "Verified" — verification is a later phase and
        // this message must not imply it (Phase 8 §32).
        'Information retrieved.',
      ),
    );
};
