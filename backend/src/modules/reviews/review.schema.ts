import { z } from 'zod';
import { REVIEW_DECISION, REVIEW_QUEUE_FILTER } from './review.types.js';

export const reviewApplicationParamsSchema = z
  .object({ applicationId: z.string().uuid('A valid application identifier is required.') })
  .strict();

/**
 * Queue filters. `status` is optional; omitting it lists everything in scope.
 *
 * Only the three review-relevant statuses are accepted. A request asking for
 * `DRAFT` is rejected rather than returning an empty list, because an empty
 * list would suggest the officer is entitled to see drafts and merely that
 * there are none — and they are not: drafts are private to the citizen and the
 * RLS policy excludes them independently.
 */
export const reviewQueueQuerySchema = z
  .object({
    status: z.enum(Object.values(REVIEW_QUEUE_FILTER)).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();

/**
 * The decision payload — the ONLY body an officer may send in this phase.
 *
 * `.strict()` is the mass-assignment guard, and here it is doing the most
 * important work in the module. A request carrying `reviewerId`, `reviewer_id`,
 * `officerId`, `status`, `applicationStatus`, `decidedAt`, `reviewedAt`,
 * `departmentId`, `citizenId` or `applicationId` is REJECTED with a 400 — not
 * silently ignored, which would leave the API looking as though it had accepted
 * them (§20).
 *
 * There is deliberately no field here for the reviewer. The officer's identity
 * comes from the verified access token and nowhere else, so there is nothing
 * for a forged field to override — the strictness above exists to make that
 * refusal visible rather than to be the thing that enforces it.
 *
 * Likewise no field for the resulting status: which status an APPROVED decision
 * produces is the database function's mapping, not the client's choice.
 */
export const reviewDecisionBodySchema = z
  .object({
    decision: z.enum(Object.values(REVIEW_DECISION), {
      message: 'Choose whether to approve or reject this application.',
    }),
    /**
     * The officer's reason. Required for a rejection, and the table constrains
     * that too — a citizen told only "rejected" has been given a decision they
     * cannot act on or appeal.
     *
     * Optional for an approval: an approval that needs explaining is unusual,
     * and demanding prose for a routine one would train officers to type
     * nothing meaningful.
     */
    remarks: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((body) => body.decision !== REVIEW_DECISION.REJECTED || body.remarks !== undefined, {
    message: 'A reason is required when rejecting an application.',
    path: ['remarks'],
  });

export type ReviewApplicationParams = z.infer<typeof reviewApplicationParamsSchema>;
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;
export type ReviewDecisionBody = z.infer<typeof reviewDecisionBodySchema>;
