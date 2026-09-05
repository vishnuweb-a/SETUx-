import { z } from 'zod';

export const applicationVerificationParamsSchema = z
  .object({ applicationId: z.string().uuid('A valid application identifier is required.') })
  .strict();

/**
 * The entire request body: empty.
 *
 * There is nothing a client could legitimately contribute to a verification
 * run. Every input is derived server-side — the application from the URL and
 * the session, the requirements from the service, the evidence from stored
 * rows, the rules from the registry, and the outcome from the rules (§19).
 *
 * `.strict()` on an empty object is therefore the strongest mass-assignment
 * guard available, and the reason this schema exists at all rather than the
 * route simply ignoring the body. A request carrying `status`,
 * `verificationStatus`, `result`, `outcome`, `score`, `verified`, `approved`,
 * `officerId`, `citizenId`, `serviceId`, `evidence`, `values`, `dataSourceId`,
 * `forcePass` or `forceFail` is REJECTED with a 400 — not silently ignored,
 * which would leave the API looking as though it had accepted them (§35).
 *
 * `forcePass` and `forceFail` in particular have no server-side counterpart
 * anywhere in this module. There is no flag to reach: the rules read evidence
 * and nothing else (§62).
 */
/**
 * `.default({})` is what lets a request legitimately send no body at all.
 *
 * `express.json()` leaves `req.body` as `undefined` when a POST carries no
 * payload, and a bare `z.object({}).strict()` rejects `undefined` — so the
 * citizen's own "Start verification" click, which has nothing to send, would
 * have been refused with a 400 before it ever reached the service. Sending
 * `{}` purely to satisfy a validator would be the client apologising for a
 * server-side accident.
 *
 * The strictness that matters is untouched: a body that IS supplied must be an
 * object with no keys, so every forged field below is still rejected outright.
 */
export const startVerificationBodySchema = z.object({}).strict().default({});

export type ApplicationVerificationParams = z.infer<typeof applicationVerificationParamsSchema>;
export type StartVerificationBody = z.infer<typeof startVerificationBodySchema>;
