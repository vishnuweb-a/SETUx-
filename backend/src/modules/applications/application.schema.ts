import { z } from 'zod';
import { APPLICATION_STATUS } from './application.types.js';

const MAX_PAGE_SIZE = 50;

export const createApplicationBodySchema = z
  .object({ service_id: z.string().uuid('A valid service identifier is required.') })
  .strict();

export const applicationIdParamsSchema = z
  .object({ applicationId: z.string().uuid('A valid application identifier is required.') })
  .strict();

export const listApplicationsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(20),
    status: z.enum([APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.SUBMITTED]).optional(),
  })
  .strict();

const declarationValueSchema = z.string().trim().max(2_000);

export const updateApplicationBodySchema = z
  .object({ fields: z.record(z.string().min(1).max(120), declarationValueSchema) })
  .strict();

export const submitApplicationBodySchema = z.object({}).strict();

export type CreateApplicationInput = z.infer<typeof createApplicationBodySchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationBodySchema>;
