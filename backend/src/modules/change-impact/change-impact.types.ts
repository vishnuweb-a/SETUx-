/**
 * Domain contracts for dependency & impact detection
 * (Change & Correction Service, Phase 5).
 *
 * Phase 5 answers one question about a saved draft:
 *
 *   "Which OTHER records of this citizen's would disagree with the source once
 *    this correction is made, and how strongly does each one matter?"
 *
 * Three properties of that question shape everything below, and each is worth
 * stating before the types:
 *
 * 1. **It is READ-ONLY.** Nothing in this module writes. There is no target
 *    row, no consent, no status transition and no persisted result — the answer
 *    is computed per request from configuration and the citizen's own record
 *    inventory. A draft that has had its impact detected is byte-for-byte the
 *    draft it was before (task §15).
 *
 * 2. **It is a DETECTION, not a selection.** The citizen cannot yet choose
 *    which impacts to act on: target selection, consent and routing are Phase 6
 *    and later. So no type here carries `selected`, `included` or a default —
 *    a field the UI could bind a checkbox to would be a promise the backend
 *    does not keep.
 *
 * 3. **It is entirely server-derived.** The only thing a caller supplies is a
 *    change request id. The source record type, the changed field keys, the
 *    rules, the impact levels and the reasons are all read server-side, and
 *    there is no shape below in which a client-supplied one could arrive.
 */

import type { Enums } from '../../database/index.js';
import type { RecordType } from '../field-policies/index.js';

/**
 * How strongly a dependent record should be corrected alongside the source.
 *
 * Sourced from the database enum rather than restated, exactly as
 * `FieldEditability` is: adding a level to `public.change_impact_level` without
 * regenerating the types becomes a compile error here rather than a runtime
 * surprise, and the ordering below stops being exhaustive in a way the compiler
 * can see.
 */
export type ChangeImpactLevel = Enums<'change_impact_level'>;

export const CHANGE_IMPACT_LEVEL = {
  REQUIRED: 'REQUIRED',
  RECOMMENDED: 'RECOMMENDED',
  OPTIONAL: 'OPTIONAL',
} as const satisfies Record<ChangeImpactLevel, ChangeImpactLevel>;

/**
 * The strength ordering, as a total order over the three levels.
 *
 * THE MERGE RULE OF THE PHASE, expressed once so every consumer agrees. When
 * two rules reach the same target record — a name change and an address change
 * both touching the income certificate — the citizen sees ONE card, and the
 * level on it is the strongest of the two (task §9):
 *
 *   REQUIRED (2) > RECOMMENDED (1) > OPTIONAL (0)
 *
 * Higher is stronger, so merging is `Math.max` over this map rather than a
 * chain of comparisons that has to be re-read to be trusted. It is deliberately
 * not derived from the enum's declaration order — that would make a future
 * reordering of the enum silently reorder the product's severity.
 *
 * `satisfies` rather than a plain annotation: a level added to the database and
 * to `ChangeImpactLevel` and forgotten here is a compile error.
 */
export const IMPACT_LEVEL_RANK = {
  REQUIRED: 2,
  RECOMMENDED: 1,
  OPTIONAL: 0,
} as const satisfies Record<ChangeImpactLevel, number>;

/**
 * The stronger of two levels.
 *
 * Total and commutative: `merge(a, b) === merge(b, a)` for every pair, and
 * merging a level with itself returns it. Those two properties are what make
 * the engine's answer independent of the order rules come back from the
 * database, which is what "deterministic" means for this phase.
 */
export const strongerImpactLevel = (
  a: ChangeImpactLevel,
  b: ChangeImpactLevel,
): ChangeImpactLevel => (IMPACT_LEVEL_RANK[a] >= IMPACT_LEVEL_RANK[b] ? a : b);

/**
 * One active dependency rule, as the repository returns it.
 *
 * `responsible_department` is genuinely null for the bank: it is a provider,
 * not a department, and the absence is data rather than a failed join (arch
 * §20.6, §8.1).
 */
export interface DependencyRuleRow {
  readonly source_record_type: string;
  readonly source_field_key: string;
  readonly target_record_type: string;
  readonly target_field_key: string;
  readonly impact_level: ChangeImpactLevel;
  readonly reason: string;
  readonly responsible_department: { readonly code: string; readonly name: string } | null;
}

/**
 * One field the citizen has asked to change, as the impact response echoes it.
 *
 * Echoed rather than assumed to be already on the client, because the impact
 * preview must be able to state what it is predicting the consequences OF. A
 * page that listed four affected records without naming the change that affects
 * them would ask somebody to accept a consequence whose cause is off-screen.
 *
 * Both values come from the stored draft: `oldValue` is the server-taken
 * snapshot, never re-read from the source, so the preview describes the same
 * before/after pair the citizen saw on the form.
 */
export interface ImpactChangedField {
  readonly fieldKey: string;
  readonly oldValue: unknown;
  readonly proposedValue: unknown;
}

/**
 * One reason a target is affected.
 *
 * A LIST of these hangs off each impact rather than a single string, because a
 * merged target has genuinely more than one cause: correcting both a name and
 * an address affects the income certificate twice over, and collapsing that to
 * one sentence would either drop a true statement or invent a combined one that
 * no rule actually makes.
 *
 * `fieldKey` names which change produced this reason, so the UI can attribute
 * it. `impactLevel` is the level OF THIS RULE, before the merge — kept so the
 * strongest cause is identifiable rather than only the merged result.
 */
export interface ImpactReason {
  readonly fieldKey: string;
  readonly impactLevel: ChangeImpactLevel;
  readonly reason: string;
}

/**
 * One affected record, after merging every rule that reached it.
 *
 * ONE PER TARGET RECORD TYPE, always. That is the deduplication requirement of
 * the phase (task §9) and it is enforced by construction: the engine keys its
 * accumulator on the record type, so a duplicate cannot be built and then
 * filtered.
 *
 * `available` is the honest half of the model. A rule says a record type would
 * be affected; whether this citizen HOLDS such a record is a different fact,
 * answered from their own registry. An unavailable target is still returned —
 * with `recordId: null` — rather than dropped, because "your bank details are
 * not linked to SetuX, so this change cannot reach them" is information the
 * citizen needs, and silently omitting it would imply the change reaches
 * everywhere it should.
 */
export interface ChangeImpact {
  readonly recordType: RecordType;
  /** The citizen's own record of this type, or `null` when they hold none. */
  readonly recordId: string | null;
  /** True when the citizen holds a record of this type. */
  readonly available: boolean;
  /** The strongest level among the rules that reached this target. */
  readonly impactLevel: ChangeImpactLevel;
  /** Every rule's reason, strongest first then by field key. Never empty. */
  readonly reasons: readonly ImpactReason[];
  /**
   * The department that would carry out the correction, when there is one.
   *
   * `null` for the bank, which is a provider (arch §8.1). Phase 5 shows this;
   * it routes nothing.
   */
  readonly responsibleDepartment: { readonly code: string; readonly name: string } | null;
}

/**
 * The impact analysis of one draft, as `GET .../impact` returns it.
 *
 * Note what is absent: no status, no target id, no consent, no selection and no
 * "next step" the server has committed to. The response describes what the
 * server currently knows about consequences, and stops there.
 */
export interface ChangeImpactAnalysis {
  readonly changeRequestId: string;
  readonly sourceRecord: {
    readonly recordId: string;
    readonly recordType: RecordType;
  };
  readonly changedFields: readonly ImpactChangedField[];
  /** One entry per affected record type. Empty when nothing is affected. */
  readonly impacts: readonly ChangeImpact[];
}
