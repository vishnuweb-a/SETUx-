/**
 * Frontend contracts for the Change & Correction entry flow (Phase 3).
 *
 * These mirror the read-only Phase 2 API in
 * `docs/API/citizen-records.md` — they are the shape the backend already
 * returns, not a second model of it.
 *
 * Two things are deliberately absent, and must stay absent while this phase
 * stands: a proposed value and a change request. Phase 3 selects which fields a
 * citizen wants to correct; it never says what they should become and never
 * writes anything (feature.md Phase 3 boundary).
 */

/** The five record types the registry serves. */
export const RECORD_TYPES = [
  'IDENTITY_RECORD',
  'INCOME_RECORD',
  'EDUCATION_RECORD',
  'COMMUNITY_RECORD',
  'BANK_DETAILS',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * Whether SetuX believes a projection still reflects its source.
 *
 * `STALE` and `UNAVAILABLE` are honest states rather than failures: no refresh
 * mechanism exists yet, so the registry reports what it knows.
 */
export type RecordStatus = 'ACTIVE' | 'STALE' | 'UNAVAILABLE';

/** How freely a field may be corrected, as the Phase 1 policy decides. */
export type FieldEditability = 'EDITABLE' | 'CONDITIONALLY_EDITABLE' | 'IMMUTABLE';

export interface RecordSource {
  readonly code: string;
  readonly name: string;
}

/**
 * The authority responsible for correcting a record.
 *
 * `null` is meaningful, not missing: the synthetic bank is a provider rather
 * than a department, so it has no officer queue and the API says so instead of
 * inventing an authority.
 */
export interface RecordAuthority {
  readonly code: string;
  readonly name: string;
}

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
 * One field of a record together with the policy governing it.
 *
 * `editability` is `null` when no active policy covers the field, and
 * `changeable` is then `false`. The frontend never derives either: it renders
 * the server's decision, so a policy change takes effect without a deploy and a
 * forged client has nothing to forge (docs/API/citizen-records.md §3).
 *
 * `value` is `unknown` because the source decides its type. Render it through
 * `formatFieldValue`, never directly.
 */
export interface CitizenRecordField {
  readonly fieldKey: string;
  readonly value: unknown;
  readonly retrievedAt: string;
  readonly editability: FieldEditability | null;
  readonly changeable: boolean;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly policyAuthority: string | null;
}

export interface CitizenRecordDetail extends CitizenRecordSummary {
  readonly fields: readonly CitizenRecordField[];
}

export interface CitizenRecordListPayload {
  readonly items: readonly CitizenRecordSummary[];
  readonly total: number;
}

/**
 * What the record screen hands to the next phase.
 *
 * Carried in router state rather than persisted: Phase 3 creates no draft, and
 * a table to hold a transient selection would be a Phase 4 decision made early
 * (feature.md Phase 3 §4).
 *
 * This is a *convenience*, never an authority. The phase that accepts a
 * proposed value must re-check every key with `assertFieldEditable` server-side
 * — see `docs/FEATURES/change-details-entry.md` §5.
 */
export interface FieldSelectionHandoff {
  readonly recordId: string;
  readonly selectedFieldKeys: readonly string[];
}
