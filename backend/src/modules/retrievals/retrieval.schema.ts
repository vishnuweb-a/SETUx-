import { z } from 'zod';

export const applicationRetrievalParamsSchema = z
  .object({ applicationId: z.string().uuid('A valid application identifier is required.') })
  .strict();

/**
 * The entire request body.
 *
 * One field, and it names a requirement — not a source, not a consent, not a
 * citizen. Everything else the retrieval needs is derived from it server-side:
 * the application from the URL and the session, the data source from the
 * requirement's configuration, the consent from the pair, and the connector
 * from the source (Phase 8 §23).
 *
 * `.strict()` is the mass-assignment guard. A body carrying `citizenId`,
 * `dataSourceId`, `consentStatus`, `providerReference`, `retrievalStatus` or a
 * `values` payload is rejected outright, rather than being silently ignored and
 * leaving the API looking as though it accepted them.
 */
export const createRetrievalBodySchema = z
  .object({ requirementId: z.string().uuid('A valid requirement identifier is required.') })
  .strict();

export type ApplicationRetrievalParams = z.infer<typeof applicationRetrievalParamsSchema>;
export type CreateRetrievalBody = z.infer<typeof createRetrievalBodySchema>;
