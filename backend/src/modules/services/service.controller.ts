import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { successBody } from '../../shared/utils/index.js';
import {
  getServiceCatalogue,
  getServiceDepartments,
  getServiceDetail,
  getServiceRequirements,
} from './service.service.js';
import {
  listServicesQuerySchema,
  type ServiceIdParams,
} from './service.schema.js';

/**
 * HTTP layer for the catalogue.
 *
 * Controllers read validated input, call the service and choose a status code.
 * No filtering decision is taken here — which services a citizen may see is a
 * property of the query the repository builds, not of the handler
 * (AGENT.md §7).
 */

/**
 * Re-parses the query string.
 *
 * `validateRequest` has already rejected anything invalid, but Express 5 makes
 * `req.query` a getter it cannot reassign, so the coerced values (`page` and
 * `limit` as numbers, defaults applied) are not written back. Parsing the
 * already-validated object here is what turns `?page=2` into the number 2.
 */
const parseListQuery = (req: Request) => listServicesQuerySchema.parse(req.query);

/** `GET /api/v1/services` — a page of the catalogue (api-specification.md §15.1). */
export const handleListServices = async (req: Request, res: Response): Promise<void> => {
  const payload = await getServiceCatalogue(parseListQuery(req));

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/**
 * `GET /api/v1/services/departments` — filter options.
 *
 * Declared before `/:serviceId` in the router so the literal path wins; a
 * request for `departments` must not be read as a service id.
 */
export const handleListServiceDepartments = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const departments = await getServiceDepartments();

  res.status(HTTP_STATUS.OK).json(successBody({ departments }));
};

/** `GET /api/v1/services/:serviceId` — details and requirements (§15.2). */
export const handleGetService = async (req: Request, res: Response): Promise<void> => {
  const { serviceId } = req.params as unknown as ServiceIdParams;
  const payload = await getServiceDetail(serviceId);

  res.status(HTTP_STATUS.OK).json(successBody(payload));
};

/** `GET /api/v1/services/:serviceId/requirements` — requirements only (§15.3). */
export const handleGetServiceRequirements = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { serviceId } = req.params as unknown as ServiceIdParams;
  const requirements = await getServiceRequirements(serviceId);

  res.status(HTTP_STATUS.OK).json(successBody(requirements));
};
