import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import { applicationConsentParamsSchema, consentIdParamsSchema } from './consent.schema.js';
import { decideApplicationConsent, getApplicationConsents } from './consent.service.js';

export const handleGetApplicationConsents = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = applicationConsentParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.OK).json(successBody(await getApplicationConsents(req.auth!, applicationId)));
};

export const handleGrantConsent = async (req: Request, res: Response): Promise<void> => {
  const { consentId } = consentIdParamsSchema.parse(req.params);
  res
    .status(HTTP_STATUS.OK)
    .json(successBody(await decideApplicationConsent(req.auth!, consentId, true), 'Consent granted.'));
};

export const handleDenyConsent = async (req: Request, res: Response): Promise<void> => {
  const { consentId } = consentIdParamsSchema.parse(req.params);
  res
    .status(HTTP_STATUS.OK)
    .json(successBody(await decideApplicationConsent(req.auth!, consentId, false), 'Consent denied.'));
};
