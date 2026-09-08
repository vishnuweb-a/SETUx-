/**
 * Frontend contracts for the change draft (Phase 4).
 *
 * These mirror the Phase 4 API in `docs/FEATURES/change-draft-editable-form.md`
 * — the shape the backend already returns, not a second model of it.
 *
 * The distinction the whole feature rests on is visible in `ChangeDraftField`:
 * `oldValue` is what the government source holds, `proposedValue` is what the
 * citizen is asking for, and they are two separate fields because they are two
 * separate things. The form shows the first read-only and the second as an
 * input, and nothing in this feature ever writes the second over the first.
 */

import type { FieldEditability, RecordType } from './change-details.types';

/**
 * The only status a Phase 4 draft can hold.
 *
 * The wider lifecycle — consent, submission, review, completion — belongs to
 * later phases and is deliberately not modelled here. A union with unreachable
 * members would suggest to the next reader that this screen handles states it
 * has never seen.
 */
export type ChangeRequestStatus = 'DRAFT';

/**
 * The policy that applied to a field when the draft was taken.
 *
 * `editability` excludes IMMUTABLE by construction: an immutable field never
 * enters a draft, and the server refuses one that tries.
 *
 * This is what the form reads to decide whether to warn that a change will need
 * evidence and review. It is a description, never a permission — the server
 * re-checks the live policy on every save regardless of what this says.
 */
export interface ChangeFieldPolicy {
  readonly editability: Exclude<FieldEditability, 'IMMUTABLE'>;
  readonly requiresEvidence: boolean;
  readonly requiresReview: boolean;
  readonly authority: string | null;
}

/**
 * One requested correction.
 *
 * `oldValue` and `proposedValue` are `unknown` because the source decides their
 * type — a mobile number is a string, an assessment year may be a number.
 * Render both through `formatFieldValue`, never directly.
 */
export interface ChangeDraftField {
  readonly fieldKey: string;
  /** What the source held when the draft was created. Read-only, always. */
  readonly oldValue: unknown;
  /** What the citizen is asking for. */
  readonly proposedValue: unknown;
  readonly policy: ChangeFieldPolicy;
  /**
   * Why the citizen says the value is wrong.
   *
   * `null` when they have not written one. Optional at DRAFT: a half-finished
   * correction is still worth saving, and it is the phase that submits the
   * request — where somebody else has to read it — that decides whether to
   * insist on one.
   */
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A draft change request as the API returns it.
 *
 * This is the authority once a draft exists. The Phase 3 field selection gets
 * the citizen as far as creating one; from that point the server's answer is
 * what the screen renders, which is what lets the draft survive a refresh
 * (docs/FEATURES/change-draft-editable-form.md §7).
 */
export interface ChangeDraftDetail {
  readonly id: string;
  readonly requestNumber: string;
  readonly status: ChangeRequestStatus;
  readonly sourceRecordId: string;
  readonly sourceRecordType: RecordType;
  readonly fields: readonly ChangeDraftField[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * One field in a create or revise request.
 *
 * Note what a client may send: a key, and a value. No old value, no
 * editability, no authority — the server derives all three and would reject a
 * body carrying them, because every request schema is strict.
 */
export interface ChangeDraftFieldInput {
  readonly fieldKey: string;
  readonly proposedValue: string;
  /** Omitted entirely when the citizen left it blank. */
  readonly reason?: string;
}

export interface CreateChangeDraftInput {
  readonly sourceRecordId: string;
  readonly fields: readonly ChangeDraftFieldInput[];
}

export interface UpdateChangeDraftInput {
  readonly fields: readonly ChangeDraftFieldInput[];
}
