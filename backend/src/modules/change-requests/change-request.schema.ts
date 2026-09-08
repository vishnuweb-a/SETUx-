import { z } from 'zod';

/**
 * Request validation for the change draft API
 * (Change & Correction Service, Phase 4).
 *
 * What these schemas REFUSE is the point of the file. A draft is created from
 * exactly two things the client is allowed to name — which record, and what the
 * citizen wants each chosen field to say — and everything else the server
 * derives for itself:
 *
 *   fieldKey        accepted, but only as a key to LOOK UP; the field must
 *                   belong to the named record or the request fails
 *   oldValue        NOT accepted. Snapshotted server-side (arch §4.5)
 *   editability     NOT accepted. Re-read from the live policy on every write
 *   requiresEvidence / requiresReview / authority
 *                   NOT accepted. Properties of the policy, not of the request
 *   recordType      NOT accepted. Read through the record's own FK
 *   citizenId       NOT accepted. Resolved from the verified access token
 *   status          NOT accepted. DRAFT, set by the server
 *   requestNumber   NOT accepted. A database column default
 *
 * `.strict()` on every object is what turns those absences into visible 400s.
 * A body carrying `"oldValue": "something the source never said"` must be a
 * rejected request, not a silently dropped key — the silent version leaves a
 * caller believing the field was honoured, and leaves the next reader of this
 * file unsure whether it was.
 */

/**
 * The change request id, as a path parameter.
 *
 * A UUID check at the edge, so a malformed id is a 400 before any query runs,
 * and the remaining answers stay correctly ordered:
 *
 *   400  that is not a change request identifier
 *   404  no draft of yours has that identifier
 *
 * There is deliberately no third answer for "that draft belongs to somebody
 * else": the repository scopes every lookup by owner, so another citizen's
 * draft produces the same 404 as an id that never existed (task §9).
 */
export const changeRequestIdParamsSchema = z
  .object({
    changeRequestId: z.string().uuid('A valid change request identifier is required.'),
  })
  .strict();

export type ChangeRequestIdParams = z.infer<typeof changeRequestIdParamsSchema>;

/**
 * The query string, which accepts NOTHING.
 *
 * An empty strict object is the assertion, not a placeholder: these endpoints
 * take no filter, no page and no sort, and `?citizenId=…` must be a visible
 * error rather than a parameter someone believes worked.
 */
export const noQuerySchema = z.object({}).strict();

/**
 * The maximum length of a proposed value's textual form.
 *
 * Generous for a government field and far short of anything that could be used
 * to inflate a row. The bound exists because an unbounded text column reachable
 * from a request body is a storage-abuse surface, not because any real field
 * approaches it.
 */
const MAX_PROPOSED_VALUE_LENGTH = 512;

/**
 * How many fields one draft may carry.
 *
 * A record has fewer than a dozen fields and only some are correctable, so this
 * cannot be reached by legitimate use. It bounds the work a single request can
 * ask for: each field costs a policy read and a source lookup, and an
 * unbounded array is an amplification factor.
 */
const MAX_FIELDS_PER_REQUEST = 20;

/** Matches the `change_request_fields_reason_shaped` CHECK constraint. */
const MAX_REASON_LENGTH = 500;

/**
 * What a citizen may propose.
 *
 * A JSON-safe scalar: string, number or boolean. Deliberately NOT an object or
 * an array, and the restriction is doing real work rather than being cautious
 * by default:
 *
 * - Every correctable field in the seeded policy set is a scalar — a name, a
 *   mobile number, an address. There is no field whose correct new value is a
 *   nested structure, so accepting one would accept something no field can use.
 * - A nested object reaching a JSONB column is how `__proto__`, `constructor`
 *   and `prototype` keys get stored and later spread into a live object by some
 *   consumer that assumes the shape is safe. Refusing objects at the edge means
 *   that path does not exist rather than being defended in depth (task §7).
 * - It keeps the "did this actually change?" comparison honest: two scalars
 *   compare by value, whereas two structurally-equal objects with different key
 *   order do not.
 *
 * A later phase that genuinely needs a structured value should widen this
 * against a specific field's policy, not in general.
 */
const proposedValueSchema = z.union(
  [
    z
      .string()
      .trim()
      .min(1, 'Enter a new value.')
      .max(
        MAX_PROPOSED_VALUE_LENGTH,
        `A new value must be ${MAX_PROPOSED_VALUE_LENGTH} characters or fewer.`,
      ),
    // Finite only: NaN and Infinity are not JSON, and `JSON.parse` cannot
    // produce them — but a number that survives to the database as `null`
    // because it was non-finite would be a value silently different from what
    // was sent.
    z.number().finite('Enter a valid number.'),
    z.boolean(),
  ],
  { message: 'A new value must be text, a number or a yes/no value.' },
);

/**
 * One requested correction in a create or update body.
 *
 * Note the trim on the string branch above: `"   "` becomes `""` and fails the
 * `min(1)`, so whitespace cannot masquerade as a value. That matters more than
 * it looks — a blank correction that reached the database would ask a
 * department to replace a citizen's name with nothing.
 */
const changeFieldInputSchema = z
  .object({
    fieldKey: z
      .string()
      .trim()
      .regex(
        /^[a-z][A-Za-z0-9]{1,63}$/u,
        'A valid field key is required.',
      ),
    proposedValue: proposedValueSchema,
    /**
     * Why the citizen says the value is wrong.
     *
     * Optional, matching the column: a draft is work in progress, and refusing
     * to save one until an explanation is written would make it less useful
     * than the transient form it replaces. An explicit `null` and an omitted
     * key both mean "not given".
     *
     * Trimmed and bounded. It is free text written by a citizen and is stored
     * as a parameter, never interpolated — and it is never logged.
     */
    reason: z
      .string()
      .trim()
      .min(1, 'Enter a reason, or leave it blank.')
      .max(MAX_REASON_LENGTH, `A reason must be ${MAX_REASON_LENGTH} characters or fewer.`)
      .nullish(),
  })
  .strict();

/**
 * The list of requested corrections, shared by create and update.
 *
 * Duplicate keys are refused HERE rather than left to the database's unique
 * constraint. Both refuse it, and the constraint is what makes the invariant
 * true under concurrency — but a caller sending the same field twice with two
 * different values has written an ambiguous request, and telling them so is a
 * better answer than a constraint violation whose message names a database
 * object.
 */
const changeFieldsSchema = z
  .array(changeFieldInputSchema)
  .min(1, 'Select at least one detail to correct.')
  .max(MAX_FIELDS_PER_REQUEST, 'Too many details were selected for one request.')
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();

    for (const [index, field] of fields.entries()) {
      if (seen.has(field.fieldKey)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'fieldKey'],
          message: 'This detail is listed more than once.',
        });
      }
      seen.add(field.fieldKey);
    }
  });

/**
 * `POST /change-requests/drafts` — create a draft.
 *
 * Two keys, and the record id is one of them because a field key alone is
 * ambiguous: `identityHolderName` could belong to any citizen's identity
 * record, and the server must be told which record is being corrected in order
 * to verify the caller owns it.
 */
export const createChangeDraftBodySchema = z
  .object({
    sourceRecordId: z.string().uuid('A valid record identifier is required.'),
    fields: changeFieldsSchema,
  })
  .strict();

export type CreateChangeDraftInput = z.infer<typeof createChangeDraftBodySchema>;

/**
 * `PATCH /change-requests/drafts/:id` — revise the proposed values.
 *
 * `sourceRecordId` is absent, deliberately: a draft's source record is fixed at
 * creation. Allowing it to move would let one draft's snapshotted old values
 * belong to a record they never came from, and there is no user need for it —
 * correcting a different record is a different request.
 *
 * The `fields` array is a REPLACEMENT of the draft's field set, not a partial
 * merge. That is the honest model for a form: the screen shows every field in
 * the draft, so what it submits is the whole set, and a field the citizen
 * removed should disappear rather than linger because the payload did not
 * mention it. The service reconciles — keeping the ORIGINAL `old_value` for any
 * field that stays, because the snapshot belongs to the field, not to the edit.
 */
export const updateChangeDraftBodySchema = z
  .object({ fields: changeFieldsSchema })
  .strict();

export type UpdateChangeDraftInput = z.infer<typeof updateChangeDraftBodySchema>;
