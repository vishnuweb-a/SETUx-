/**
 * Domain contracts for the editable field policy
 * (Change & Correction Service, Phase 1).
 *
 * A policy answers one question about a *kind* of record: may a citizen ask for
 * this field to be corrected, and what does asking require of them? It is
 * configuration keyed on `(recordType, fieldKey)` and carries no citizen data,
 * no proposed value and no application — which is what lets this module exist
 * before `citizen_records` does (arch §25).
 */

import type { Enums } from '../../database/index.js';

/**
 * The record types SetuX serves policy for
 * (`docs/ARCHITECTURE/change-correction-service.md` §20.5).
 *
 * A closed set in the API even though `field_policies.record_type` is TEXT in
 * the database. The column is TEXT so a sixth record type is a seed change
 * rather than an `ALTER TYPE`; the API is closed so an unknown record type is a
 * 400 at the edge rather than a successful request answering "no fields". Those
 * two read very differently to somebody probing for record types that exist.
 */
export const RECORD_TYPES = {
  IDENTITY_RECORD: 'IDENTITY_RECORD',
  INCOME_RECORD: 'INCOME_RECORD',
  EDUCATION_RECORD: 'EDUCATION_RECORD',
  COMMUNITY_RECORD: 'COMMUNITY_RECORD',
  BANK_DETAILS: 'BANK_DETAILS',
} as const;

export type RecordType = (typeof RECORD_TYPES)[keyof typeof RECORD_TYPES];

/** Every record type, for schema construction and exhaustive iteration. */
export const RECORD_TYPE_VALUES = Object.values(RECORD_TYPES) as readonly RecordType[];

/**
 * Whether a field may be corrected.
 *
 * Sourced from the database enum rather than restated, so the two cannot drift:
 * adding a value to `public.field_editability` without regenerating the types
 * is a compile error here rather than a runtime surprise. This is the same
 * lesson the `verification_type` domain migration records — a hand-maintained
 * mirror of another system's vocabulary drifts every time that vocabulary grows.
 */
export type FieldEditability = Enums<'field_editability'>;

export const FIELD_EDITABILITY = {
  EDITABLE: 'EDITABLE',
  CONDITIONALLY_EDITABLE: 'CONDITIONALLY_EDITABLE',
  IMMUTABLE: 'IMMUTABLE',
} as const satisfies Record<FieldEditability, FieldEditability>;

/**
 * One field's policy, as the API returns it.
 *
 * Deliberately narrower than the table. `id`, `active`, `created_at` and
 * `updated_at` are not carried: `active` because every row returned is active
 * by construction (an inactive policy is never selected), and the rest because
 * they describe the configuration row rather than the policy, and a client that
 * never needs them should never receive them.
 *
 * `authority` and `dependencyGroup` ARE carried, because both are answers the
 * citizen is owed: "you cannot change this here" is only half an answer without
 * "and this is who owns it" (arch §11), and the dependency group is what later
 * explains why one correction implies another.
 */
export interface FieldPolicy {
  readonly fieldKey: string;
  readonly editability: FieldEditability;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly authority: string | null;
  readonly dependencyGroup: string | null;
}

/** The policy for one record type, as `GET .../field-policies` returns it. */
export interface RecordTypeFieldPolicies {
  readonly recordType: RecordType;
  readonly fields: readonly FieldPolicy[];
}

/**
 * The authoritative decision about one field, as the enforcement helper returns
 * it to later phases.
 *
 * A decision, not a policy row: it answers "may this be requested, and what
 * does requesting it demand" in a shape a caller can act on without
 * re-interpreting the editability itself. `requiresEvidence` and
 * `requiresReview` are the requirements the caller must then satisfy — Phase 1
 * establishes them and does not enforce them, because there is no submission to
 * enforce them against yet.
 */
export interface FieldChangeDecision {
  readonly recordType: RecordType;
  readonly fieldKey: string;
  readonly editability: FieldEditability;
  /** True for EDITABLE and CONDITIONALLY_EDITABLE; false for IMMUTABLE. */
  readonly changeable: boolean;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly authority: string | null;
}
