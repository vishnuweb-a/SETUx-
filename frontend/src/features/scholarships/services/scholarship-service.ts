import { apiRequest } from '@/services/api-client';
import type {
  ScholarshipDepartmentsPayload,
  ScholarshipDetail,
  ScholarshipListPayload,
  ScholarshipListQuery,
  ScholarshipRequirement,
} from '../types/scholarship.types';

/**
 * Catalogue API calls.
 *
 * Every request goes through the shared `apiRequest`, which attaches the bearer
 * token and normalises errors, so nothing here touches `fetch` or credentials
 * (Phase 5 §34).
 *
 * All four calls are reads. This feature has no mutation, by design: browsing a
 * scholarship must not create anything (Phase 5 §18).
 */

/**
 * Builds the list query string.
 *
 * Absent and blank filters are omitted rather than sent empty — the backend
 * schema is `.strict()` about the parameters it accepts, and "no filter" is
 * expressed by the parameter not being there. `page` is omitted at 1 so the
 * first page has a stable, clean URL.
 */
const toListSearchParams = (query: ScholarshipListQuery): string => {
  const params = new URLSearchParams();
  const search = query.search?.trim();

  if (search) params.set('search', search);
  if (query.department) params.set('department', query.department);
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page));

  const serialised = params.toString();

  return serialised.length > 0 ? `?${serialised}` : '';
};

/** `GET /services` — one page of the catalogue. */
export const fetchScholarships = async (
  query: ScholarshipListQuery,
  signal?: AbortSignal,
): Promise<ScholarshipListPayload> =>
  apiRequest<ScholarshipListPayload>(`/services${toListSearchParams(query)}`, { signal });

/** `GET /services/departments` — the options offered by the department filter. */
export const fetchScholarshipDepartments = async (
  signal?: AbortSignal,
): Promise<ScholarshipDepartmentsPayload> =>
  apiRequest<ScholarshipDepartmentsPayload>('/services/departments', { signal });

/** `GET /services/:id` — one scholarship and its requirements. */
export const fetchScholarship = async (
  scholarshipId: string,
  signal?: AbortSignal,
): Promise<ScholarshipDetail> =>
  apiRequest<ScholarshipDetail>(`/services/${encodeURIComponent(scholarshipId)}`, { signal });

/**
 * `GET /services/:id/requirements` — requirements alone.
 *
 * The detail screen does not need this: `GET /services/:id` already embeds
 * them, and a second request for data the first returned would be a wasted
 * round trip. It is part of the documented contract (api-specification.md
 * §15.3), so the client for it lives here alongside the rest.
 */
export const fetchScholarshipRequirements = async (
  scholarshipId: string,
  signal?: AbortSignal,
): Promise<readonly ScholarshipRequirement[]> =>
  apiRequest<readonly ScholarshipRequirement[]>(
    `/services/${encodeURIComponent(scholarshipId)}/requirements`,
    { signal },
  );
