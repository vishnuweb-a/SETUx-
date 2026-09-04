import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import { applicationIdParamsSchema, createApplicationBodySchema, listApplicationsQuerySchema, updateApplicationBodySchema } from './application.schema.js';
import { createApplication, getApplication, listApplications, submitApplication, updateDraftApplication } from './application.service.js';

export const handleCreateApplication = async (req: Request, res: Response): Promise<void> => {
  const payload = await createApplication(req.auth!, createApplicationBodySchema.parse(req.body));
  res.status(HTTP_STATUS.CREATED).json(successBody(payload, 'Application created successfully.'));
};
export const handleListApplications = async (req: Request, res: Response): Promise<void> => {
  res.status(HTTP_STATUS.OK).json(successBody(await listApplications(req.auth!, listApplicationsQuerySchema.parse(req.query))));
};
export const handleGetApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = applicationIdParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.OK).json(successBody(await getApplication(req.auth!, applicationId)));
};
export const handleUpdateApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = applicationIdParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.OK).json(successBody(await updateDraftApplication(req.auth!, applicationId, updateApplicationBodySchema.parse(req.body)), 'Draft saved successfully.'));
};
export const handleSubmitApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicationId } = applicationIdParamsSchema.parse(req.params);
  res.status(HTTP_STATUS.OK).json(successBody(await submitApplication(req.auth!, applicationId), 'Application submitted successfully.'));
};
