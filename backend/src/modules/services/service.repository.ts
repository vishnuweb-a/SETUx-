import { getDatabaseClient, toAppError } from '../../database/index.js';
import type { ListServicesQuery } from './service.schema.js';
import {
  SERVICE_STATUS,
  type RequirementType,
  type ServiceRequirement,
  type ServiceSummary,
} from './service.types.js';

/**
 * Persistence for the service catalogue.
 *
 * One rule governs every query in this file: `status = ACTIVE` is part of the
 * predicate, never a filter applied after the rows are read. A service that is
 * INACTIVE is not "hidden" from the citizen — it is never selected, so no
 * amount of query manipulation from the client can surface it (Phase 5 §25).
 *
 * These queries run through the service-role client and so bypass RLS. RLS
 * remains meaningful: it governs the browser's own Supabase client, which is a
 * separate path with a separate identity (security-design.md §19). The status
 * predicates here are the backend's equivalent of a policy, and the catalogue
 * policies stay `select`-only for `authenticated` — nothing in Phase 5 writes.
 */

/** Columns the list endpoint exposes — `status` is deliberately not among them. */
const SUMMARY_COLUMNS = 'id, code, name, description, department';

/**
 * Escapes the PostgREST `or`/`ilike` pattern metacharacters in a search term.
 *
 * `%` and `_` are wildcards to `ilike`, and a comma would end the current
 * predicate inside an `or(...)` list. Escaping all three means a search for
 * "100%" matches the literal text rather than everything, and that a comma in
 * the term cannot inject a second predicate.
 */
const escapeSearchPattern = (term: string): string =>
  term.replace(/[\\%_,()]/g, '\\$&');

/**
 * One page of ACTIVE services, with the total matching count.
 *
 * Search matches name, description or department, which are the three fields
 * the catalogue card shows — searching over a field the citizen cannot see
 * would make the result set look arbitrary.
 */
export const listActiveServices = async (
  query: ListServicesQuery,
): Promise<{ readonly items: readonly ServiceSummary[]; readonly total: number }> => {
  const from = (query.page - 1) * query.limit;

  let builder = getDatabaseClient()
    .from('services')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('status', SERVICE_STATUS.ACTIVE);

  if (query.department !== undefined) {
    builder = builder.eq('department', query.department);
  }

  if (query.search !== undefined) {
    const pattern = `%${escapeSearchPattern(query.search)}%`;
    builder = builder.or(
      `name.ilike.${pattern},description.ilike.${pattern},department.ilike.${pattern}`,
    );
  }

  // Ordered by name so pagination is deterministic: without a stable sort the
  // same row could appear on two pages, or on none.
  const { data, error, count } = await builder
    .order('name', { ascending: true })
    .range(from, from + query.limit - 1);

  if (error) {
    throw toAppError(error, 'services.listActiveServices', 'Service');
  }

  return { items: data ?? [], total: count ?? 0 };
};

/**
 * One ACTIVE service by id, or `null`.
 *
 * `null` covers both "no such service" and "that service is not published".
 * The caller turns either into the same 404, so the response cannot be used to
 * confirm that an unpublished service exists (Phase 5 §39).
 */
export const findActiveServiceById = async (
  serviceId: string,
): Promise<ServiceSummary | null> => {
  const { data, error } = await getDatabaseClient()
    .from('services')
    .select(SUMMARY_COLUMNS)
    .eq('id', serviceId)
    .eq('status', SERVICE_STATUS.ACTIVE)
    .maybeSingle();

  if (error) {
    throw toAppError(error, 'services.findActiveServiceById', 'Service');
  }

  return data;
};

/** The distinct departments that own at least one ACTIVE service, for the filter. */
export const listActiveServiceDepartments = async (): Promise<readonly string[]> => {
  const { data, error } = await getDatabaseClient()
    .from('services')
    .select('department')
    .eq('status', SERVICE_STATUS.ACTIVE)
    .order('department', { ascending: true });

  if (error) {
    throw toAppError(error, 'services.listActiveServiceDepartments', 'Service');
  }

  // Distinct-on is not expressible through PostgREST's select; the catalogue is
  // a small reference table, so the duplicates are removed here.
  return [...new Set((data ?? []).map((row) => row.department))];
};

/**
 * The requirements of one service, in the order the detail screen renders them.
 *
 * The join to `data_sources` names the simulated government system behind each
 * requirement. That name is the point of the screen — it is what shows the
 * citizen which departments SetuX will talk to on their behalf — and it is
 * reference data, not anyone's personal data.
 */
export const listServiceRequirements = async (
  serviceId: string,
): Promise<readonly ServiceRequirement[]> => {
  const { data, error } = await getDatabaseClient()
    .from('service_requirements')
    .select(
      'id, requirement_code, name, description, requirement_type, required, display_order, data_sources ( name )',
    )
    .eq('service_id', serviceId)
    .order('display_order', { ascending: true });

  if (error) {
    throw toAppError(error, 'service_requirements.listServiceRequirements', 'Service requirement');
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.requirement_code,
    name: row.name,
    description: row.description,
    type: row.requirement_type as RequirementType,
    source: resolveSourceName(row.data_sources),
    required: row.required,
    displayOrder: row.display_order,
  }));
};

/**
 * Reads the joined data source's name.
 *
 * PostgREST returns an embedded to-one relationship as an object, but types it
 * as possibly an array depending on how it infers the relationship; both shapes
 * are handled so a schema-cache change cannot turn this into a runtime error.
 * The FK is nullable — a citizen-supplied requirement has no source — so
 * `null` is a legitimate result, not a failure.
 */
const resolveSourceName = (
  source: { readonly name: string } | readonly { readonly name: string }[] | null,
): string | null => {
  if (source === null) return null;
  if (Array.isArray(source)) return source[0]?.name ?? null;

  return (source as { readonly name: string }).name;
};
