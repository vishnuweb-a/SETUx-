import { z } from 'zod';
import { RECORD_TYPE_VALUES } from './field-policy.types.js';

/**
 * Request validation for the field policy API
 * (Change & Correction Service, Phase 1).
 *
 * Every schema is `.strict()`, as the catalogue's are. An unknown parameter is
 * rejected rather than ignored, because a silently dropped parameter and a
 * rejected one look very different to somebody testing whether the endpoint has
 * a hidden filter — `?active=false` must be an error, not a no-op.
 *
 * Nothing here accepts an editability, a requirement flag or an authority. The
 * client has no way to state a policy, only to name the field it is asking
 * about, so a forged `editability` in a request has nowhere to land: no schema
 * admits it and no parameter carries it (arch §11, §14).
 */

/**
 * The record type, as a path parameter.
 *
 * A closed enum, so an unknown record type is a 400 before any query runs. The
 * alternative — passing arbitrary text to the repository and returning an empty
 * field list — would make "no such record type" and "a record type with no
 * policies" indistinguishable, and would let a caller enumerate the record
 * types SetuX knows about one guess at a time.
 */
export const recordTypeParamsSchema = z
  .object({
    recordType: z.enum(RECORD_TYPE_VALUES, {
      message: 'A supported government record type is required.',
    }),
  })
  .strict();

export type RecordTypeParams = z.infer<typeof recordTypeParamsSchema>;

/**
 * A normalized SetuX field key, as a path parameter.
 *
 * The pattern mirrors the database CHECK on `field_policies.field_key` exactly:
 * lowerCamelCase, which is the shape the connectors' normalization boundary
 * emits. Validating it here means an arbitrary client-supplied string never
 * reaches a query — the endpoint answers about fields SetuX could plausibly
 * have a policy for, and refuses to be a general-purpose lookup for anything
 * else (task §13: do not trust arbitrary client field names).
 *
 * A well-formed key with no policy is a different answer, and a different
 * status: 400 means "that is not a field key", 404 means "no policy governs
 * that field".
 */
const FIELD_KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,63}$/;

export const fieldPolicyParamsSchema = recordTypeParamsSchema
  .extend({
    fieldKey: z
      .string()
      .regex(FIELD_KEY_PATTERN, 'A valid record field key is required.'),
  })
  .strict();

export type FieldPolicyParams = z.infer<typeof fieldPolicyParamsSchema>;
