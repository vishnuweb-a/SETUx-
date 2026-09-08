/**
 * Domain contracts for the change draft
 * (Change & Correction Service, Phase 4).
 *
 * A change request is what a citizen has ASKED for. That single sentence
 * decides the shape of everything below, and three consequences of it are worth
 * stating before the types:
 *
 * 1. **A proposal is not a value.** `proposedValue` is a request. It is never
 *    written back to `citizen_record_fields`, never merged into the citizen's
 *    profile, and never read by the retrieval, verification or scholarship
 *    paths (arch §13). The only thing SetuX does with it in this phase is store
 *    it and show it back to the person who wrote it.
 *
 * 2. **`oldValue` is evidence, not input.** It is snapshotted server-side from
 *    the source field at draft creation and never accepted from a client, never
 *    rewritten by a later edit (arch §4.5). It records what the citizen was
 *    actually looking at when they asked.
 *
 * 3. **DRAFT is the only status.** Phase 4 creates a private working document.
 *    Consent, targets, routing, review and application are Phase 5+ (arch §25),
 *    and none of them is modelled here — not as an optional field, not as an
 *    unused enum member.
 */

import type { FieldEditability, RecordType } from '../field-policies/index.js';

/**
 * The lifecycle states this phase can produce.
 *
 * Exactly one. The full parent lifecycle in arch §5 runs
 * DRAFT → CONSENT_PENDING → SUBMITTED → IN_REVIEW → …, and every state after
 * the first belongs to a phase that does not exist yet. Declaring them now
 * would put names in the type system that no code can reach and no transition
 * validates — which reads to the next author as though those paths are
 * supported.
 *
 * A `const` object rather than an enum, matching every other status vocabulary
 * in the codebase.
 */
export const CHANGE_REQUEST_STATUS = {
  DRAFT: 'DRAFT',
} as const;

export type ChangeRequestStatus =
  (typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS];

/**
 * The policy that applied to a field when the draft was taken.
 *
 * Stored as `policy_snapshot` and returned to the citizen so the form can
 * explain what their request will require of them — "this change may need
 * supporting evidence and department review" — using the rules they were
 * actually shown.
 *
 * It is EVIDENCE, never AUTHORIZATION. Every mutation re-reads the live policy
 * through `assertFieldEditable` and takes its answer; a field that has since
 * become IMMUTABLE is refused on the next write no matter what this snapshot
 * says. The two are not in tension: the live policy decides what may happen
 * now, the snapshot records what was true then.
 *
 * `editability` cannot be `IMMUTABLE` here, and that is a property of the data
 * rather than a convention — an immutable field never enters a draft, and the
 * table's CHECK constraint refuses a snapshot claiming otherwise.
 */
export interface FieldPolicySnapshot {
  readonly editability: Exclude<FieldEditability, 'IMMUTABLE'>;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly authority: string | null;
}

/**
 * One requested correction, as the API returns it.
 *
 * Both values are carried because the citizen is owed both: a form that showed
 * only what they typed would give them no way to check it against what the
 * government actually holds, which is the comparison the whole screen exists to
 * make.
 *
 * `value` types are `unknown` because the source decides them — an income band
 * is a token, an aggregate percentage a number. The frontend renders them
 * through a formatter rather than assuming string.
 *
 * Note the absence of `citizenRecordFieldId`. The internal row id of the source
 * field is a routing key the client can neither use nor act on, and the field
 * is already identified by `fieldKey` within a record the client knows. It stays
 * server-side, in keeping with the projection discipline the Phase 2 repository
 * established.
 */
export interface ChangeRequestField {
  readonly fieldKey: string;
  /** What the source held when the draft was created. Immutable. */
  readonly oldValue: unknown;
  /** What the citizen is asking for. A request, never a value. */
  readonly proposedValue: unknown;
  /** The policy as it applied at draft time. */
  readonly policy: FieldPolicySnapshot;
  /**
   * The citizen's own account of why the value is wrong (arch §4.5).
   *
   * `null` when they have not written one. Optional at DRAFT deliberately: a
   * half-finished correction is still worth saving, and the phase that owns
   * submission is where somebody else has to read it.
   */
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A draft change request with its requested corrections.
 *
 * `sourceRecord` names where the correction was started from — the record type,
 * the provider and the responsible authority — because a draft read back on its
 * own must be comprehensible without a second request. The record's internal
 * UUID IS carried as `sourceRecordId`: unlike the field row id it is an id the
 * client already holds (it navigated from that record) and needs, to offer
 * "back to record".
 */
export interface ChangeRequestDetail {
  readonly id: string;
  readonly requestNumber: string;
  readonly status: ChangeRequestStatus;
  readonly sourceRecordId: string;
  readonly sourceRecordType: RecordType;
  readonly fields: readonly ChangeRequestField[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A stored `change_requests` row, as the repository returns it. */
export interface ChangeRequestRow {
  readonly id: string;
  readonly request_number: string;
  readonly citizen_id: string;
  readonly source_record_id: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A stored `change_request_fields` row, as the repository returns it. */
export interface ChangeRequestFieldRow {
  readonly field_key: string;
  readonly old_value: unknown;
  readonly proposed_value: unknown;
  readonly policy_snapshot: unknown;
  readonly reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * One field the service has fully resolved and is ready to persist.
 *
 * Every value on it is SERVER-DERIVED except `proposedValue`, which is the only
 * thing the citizen actually supplies. That asymmetry is the phase's security
 * model expressed as a type: there is no shape in which a caller's `oldValue`
 * or claimed editability could reach the repository, because the repository
 * takes this type and this type has nowhere to put them.
 */
export interface ResolvedChangeField {
  readonly fieldKey: string;
  readonly citizenRecordFieldId: string;
  readonly oldValue: unknown;
  readonly proposedValue: unknown;
  readonly policySnapshot: FieldPolicySnapshot;
  readonly reason: string | null;
}
