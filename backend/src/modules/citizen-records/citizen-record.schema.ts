import { z } from 'zod';

/**
 * Request validation for the citizen record API
 * (Change & Correction Service, Phase 2).
 *
 * There is exactly ONE schema here, and what is absent from this file matters
 * more than what is in it:
 *
 * - **No body schema of any kind.** No endpoint in this phase accepts a body,
 *   because no endpoint in this phase writes (task §22).
 * - **No `citizenId` anywhere.** Not in a param, not in a query, not in a body.
 *   The citizen is resolved from the verified access token in the service, so a
 *   forged owner id has no parameter to travel in — it is not rejected by a
 *   check that could be forgotten, it is unrepresentable (task §19, §28).
 * - **No `recordType` filter, no `status` filter.** A citizen's inventory is
 *   small and is returned whole; a filter would be a query surface with no
 *   caller.
 *
 * `.strict()` for the same reason the catalogue's schemas are strict: an
 * unknown parameter is rejected rather than ignored. `?citizenId=<someone else>`
 * must be a visible 400, not a silently dropped no-op that leaves a caller
 * unsure whether the filter was honoured.
 */

/**
 * The record id, as a path parameter.
 *
 * A UUID check at the edge, so a malformed id is a 400 before any query runs.
 * That keeps the three answers distinct and correctly ordered:
 *
 *   400  that is not a record identifier
 *   404  no record of yours has that identifier
 *
 * and there is deliberately no third answer for "that record belongs to
 * somebody else" — the service scopes the lookup by owner, so another citizen's
 * record produces the same 404 as an id that never existed (task §19).
 */
export const recordIdParamsSchema = z
  .object({ recordId: z.string().uuid('A valid record identifier is required.') })
  .strict();

export type RecordIdParams = z.infer<typeof recordIdParamsSchema>;

/**
 * The query string, which accepts NOTHING.
 *
 * An empty `.strict()` object is not a placeholder — it is the assertion. Both
 * endpoints return the caller's own complete inventory, so there is no filter,
 * no page and no sort to accept; and because the object is strict, a query
 * parameter that looks like it should work is a visible 400 rather than a
 * silently ignored no-op.
 *
 * The parameter that matters is `?citizenId=`. Without this schema a request
 * naming another citizen would return 200 with the caller's OWN records — the
 * safe outcome, but an actively misleading one: it reads as though the filter
 * was applied and the other citizen simply has these records. Rejecting it
 * says plainly that the endpoint has no such parameter, which is both the
 * honest answer and the one that does not invite a caller to keep probing for
 * the spelling that works.
 */
export const noQuerySchema = z.object({}).strict();
