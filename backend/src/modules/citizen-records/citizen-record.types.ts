/**
 * Domain contracts for the citizen record registry
 * (Change & Correction Service, Phase 2).
 *
 * A citizen record is what SetuX knows a government source holds about ONE
 * citizen — independent of any application (arch §4.1). Two properties of this
 * module follow from that and are worth stating before the types:
 *
 * 1. **It is a projection, not evidence.** These values describe what the
 *    source says NOW. `application_data` holds what a source said at the moment
 *    a scholarship was decided, and that stays frozen (arch §17). Nothing in
 *    this module reads or writes `application_data`.
 *
 * 2. **It is read-only in this phase.** There is no proposed value, no change
 *    request and no mutation contract anywhere below. Phase 2 builds the
 *    inventory; Phase 3 and later build the correction on top of it (arch §25).
 */

import { RECORD_TYPES, type RecordType } from '../field-policies/index.js';
import type { FieldEditability } from '../field-policies/index.js';

/**
 * The record types the registry serves.
 *
 * Re-exported from the field policy module rather than redeclared. Phase 1
 * established `(record_type, field_key)` as the shared vocabulary, and a second
 * copy of the record-type list here would be a second thing to keep in step —
 * the exact drift the `verification_type` domain migration exists to record as
 * a lesson. One definition, imported by everything that needs it.
 */
export { RECORD_TYPES, type RecordType };

/**
 * Whether SetuX believes this projection reflects its source.
 *
 * `STALE` and `UNAVAILABLE` are honest states, not error states: no refresh
 * mechanism exists yet (arch §19, §24), so the registry says what it knows
 * rather than implying every row is current.
 */
export const RECORD_STATUS = {
  ACTIVE: 'ACTIVE',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type RecordStatus = (typeof RECORD_STATUS)[keyof typeof RECORD_STATUS];

/** The source system holding a record, as the API names it. */
export interface RecordSource {
  readonly code: string;
  readonly name: string;
}

/**
 * The authority responsible for correcting a record.
 *
 * `null` is meaningful rather than missing: the synthetic bank is a PROVIDER,
 * not a department (arch §20.6, §8.1). It has no officer queue, so a bank
 * record legitimately has no authority department, and the API says so instead
 * of inventing one.
 */
export interface RecordAuthority {
  readonly code: string;
  readonly name: string;
}

/**
 * A record as the list endpoint returns it.
 *
 * `sourceRecordRef` IS exposed: it is the handle the citizen would quote to the
 * issuing office, and a correction service that hid it would make its own
 * records unidentifiable to their owner. The internal `data_source_id` and
 * `authority_department_id` UUIDs are NOT exposed — a client has no use for a
 * routing key it cannot act on, and the source and authority are already
 * described by code and name.
 */
export interface CitizenRecordSummary {
  readonly id: string;
  readonly recordType: RecordType;
  readonly source: RecordSource;
  readonly authority: RecordAuthority | null;
  readonly sourceRecordRef: string;
  readonly status: RecordStatus;
  readonly sourceVersion: string | null;
  readonly lastSyncedAt: string | null;
  readonly isSimulated: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One field of a record, with the policy that governs it.
 *
 * The policy half is Phase 1 data read through Phase 1's own service — this
 * module never re-derives editability, and never stores it. Carrying it here
 * is what lets the Phase 3 UI explain a locked field rather than hide it, which
 * feature.md requires of the change form.
 *
 * `editability` is `null` when no active policy governs the field. That is a
 * refusal, not a permissive default: a field SetuX has no policy for is never
 * presented as changeable (arch §11, and the same rule Phase 1's service
 * applies).
 */
export interface CitizenRecordField {
  readonly fieldKey: string;
  readonly value: unknown;
  readonly retrievedAt: string;
  readonly editability: FieldEditability | null;
  /** True only for a field an active policy marks EDITABLE or CONDITIONALLY_EDITABLE. */
  readonly changeable: boolean;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly policyAuthority: string | null;
}

/** One record with its current field values, as the detail endpoint returns it. */
export interface CitizenRecordDetail extends CitizenRecordSummary {
  readonly fields: readonly CitizenRecordField[];
}

/** The citizen's whole record inventory, as `GET /citizen-records` returns it. */
export interface CitizenRecordListPayload {
  readonly items: readonly CitizenRecordSummary[];
  readonly total: number;
}

/**
 * A record row as the repository reads it, before the API shape is derived.
 *
 * Internal to the module: the UUIDs on it are the ones the response omits.
 */
export interface CitizenRecordRow {
  readonly id: string;
  readonly record_type: string;
  readonly source_record_ref: string;
  readonly status: string;
  readonly source_version: string | null;
  readonly last_synced_at: string | null;
  readonly is_simulated: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly source: RecordSource | null;
  readonly authority: RecordAuthority | null;
}

/** A field row as the repository reads it. */
export interface CitizenRecordFieldRow {
  readonly field_key: string;
  readonly field_value: unknown;
  readonly retrieved_at: string;
}
