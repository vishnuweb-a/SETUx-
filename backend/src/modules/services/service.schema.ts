import { z } from 'zod';

/**
 * Request validation for the catalogue (Phase 5 §21).
 *
 * Every schema is `.strict()`. An unknown query parameter is rejected rather
 * than ignored, so a client cannot probe for a hidden filter — `?status=` being
 * silently dropped and `?status=` being an error look very different to someone
 * testing whether INACTIVE services can be reached (Phase 5 §45).
 */

/** Bounds on page size. An unbounded `limit` is a denial-of-service parameter. */
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 12;

/**
 * The free-text search term.
 *
 * Trimmed first, then an empty result is normalised to `undefined` so that
 * `?search=%20%20` means "no filter" rather than "match the empty string". The
 * length cap keeps a pathological term out of the database; the value itself is
 * always passed as a bound parameter, never interpolated into SQL.
 */
const searchTerm = z
  .string()
  .max(120, 'Search terms are limited to 120 characters.')
  .transform((value) => value.trim())
  .transform((value) => (value.length === 0 ? undefined : value));

/** `GET /api/v1/services` query string. */
export const listServicesQuerySchema = z
  .object({
    search: searchTerm.optional(),
    /**
     * Department filter. Matched exactly against `services.department`, which
     * is how database-design.md §5.4 models service ownership for the MVP.
     */
    department: z
      .string()
      .max(120)
      .transform((value) => value.trim())
      .transform((value) => (value.length === 0 ? undefined : value))
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

/**
 * `:serviceId` path parameter.
 *
 * A UUID check here is what turns a malformed id into a 400 before it reaches
 * the database, rather than letting PostgreSQL raise a type error whose message
 * would have to be suppressed further downstream (Phase 5 §43).
 */
export const serviceIdParamsSchema = z
  .object({
    serviceId: z.string().uuid('A valid service identifier is required.'),
  })
  .strict();

export type ServiceIdParams = z.infer<typeof serviceIdParamsSchema>;
