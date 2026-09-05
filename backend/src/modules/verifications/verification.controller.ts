import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import { applicationVerificationParamsSchema } from './verification.schema.js';
import {
  getApplicationVerification,
  startApplicationVerification,
} from './verification.service.js';

export const handleGetApplicationVerification = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { applicationId } = applicationVerificationParamsSchema.parse(req.params);
  res
    .status(HTTP_STATUS.OK)
    .json(successBody(await getApplicationVerification(req.auth!, applicationId)));
};

export const handleStartApplicationVerification = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { applicationId } = applicationVerificationParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.CREATED).json(
    successBody(
      await startApplicationVerification(req.auth!, applicationId),
      // "Checked", never "Approved". Verification is SetuX comparing evidence
      // against rules; whether the application succeeds is the officer's
      // decision in Phase 11, and this message must not pre-empt it (§43).
      'Your information has been checked.',
    ),
  );
};
