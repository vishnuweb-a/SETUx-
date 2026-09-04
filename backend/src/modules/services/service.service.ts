import { NotFoundError } from '../../shared/errors/index.js';
import {
  findActiveServiceById,
  listActiveServiceDepartments,
  listActiveServices,
  listServiceRequirements,
} from './service.repository.js';
import type { ListServicesQuery } from './service.schema.js';
import type {
  ServiceDetail,
  ServiceListPayload,
  ServiceRequirement,
} from './service.types.js';

/**
 * Catalogue business logic (Phase 5).
 *
 * Read-only by design. Nothing in this module writes, and in particular nothing
 * here touches `applications` — choosing a scholarship is not applying for one,
 * and application creation belongs to Phase 6 (Phase 5 §18, §46).
 */

/** The resource name used in every catalogue 404, so all of them read alike. */
const SERVICE_RESOURCE = 'Service';

/** One page of the catalogue, with the metadata the pager needs. */
export const getServiceCatalogue = async (
  query: ListServicesQuery,
): Promise<ServiceListPayload> => {
  const { items, total } = await listActiveServices(query);

  return {
    items,
    page: query.page,
    limit: query.limit,
    total,
    // Always at least one page, so an empty catalogue reports "page 1 of 1"
    // rather than "page 1 of 0", which no pager can render sensibly.
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
};

/** The departments offered by the filter — only those with a visible service. */
export const getServiceDepartments = async (): Promise<readonly string[]> =>
  listActiveServiceDepartments();

/**
 * One service and its requirements.
 *
 * The service is resolved first and the requirements only afterwards. Fetching
 * both in parallel would leak: requirements are readable for any id, so a
 * concurrent fetch would query rows belonging to a service the caller is not
 * allowed to know exists. Sequencing them means an unpublished or unknown id
 * produces a 404 having read nothing about it.
 */
export const getServiceDetail = async (serviceId: string): Promise<ServiceDetail> => {
  const service = await findActiveServiceById(serviceId);

  if (!service) {
    throw new NotFoundError(SERVICE_RESOURCE);
  }

  return { ...service, requirements: await listServiceRequirements(serviceId) };
};

/**
 * The requirements of one service (api-specification.md §15.3).
 *
 * Guarded by the same visibility check as the detail endpoint. Without it this
 * route would be the way around it: the requirements of an unpublished service
 * would still describe what that service is.
 */
export const getServiceRequirements = async (
  serviceId: string,
): Promise<readonly ServiceRequirement[]> => {
  const service = await findActiveServiceById(serviceId);

  if (!service) {
    throw new NotFoundError(SERVICE_RESOURCE);
  }

  return listServiceRequirements(serviceId);
};
