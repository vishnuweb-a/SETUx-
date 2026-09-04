import { z } from 'zod';

/**
 * Route parameters. Both identifiers are UUIDs the server then re-checks
 * against the caller's own rows — validating the shape only stops malformed
 * input reaching the database, it authorizes nothing.
 */
export const applicationConsentParamsSchema = z
  .object({ applicationId: z.string().uuid('A valid application identifier is required.') })
  .strict();

export const consentIdParamsSchema = z
  .object({ consentId: z.string().uuid('A valid consent identifier is required.') })
  .strict();

/**
 * The decision endpoints take no body.
 *
 * `.strict()` is the point: it rejects a request that tries to smuggle in a
 * `citizen_id`, `data_source_id`, `status` or `application_id`. Every one of
 * those is derived server-side, and silently ignoring them would leave the API
 * looking as though it accepted them (Phase 7 §15, §21).
 */
export const consentDecisionBodySchema = z.object({}).strict();

export type ApplicationConsentParams = z.infer<typeof applicationConsentParamsSchema>;
export type ConsentIdParams = z.infer<typeof consentIdParamsSchema>;
