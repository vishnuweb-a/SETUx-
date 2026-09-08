/**
 * Frontend contracts for dependency & impact detection (Phase 5).
 *
 * These mirror the Phase 5 API — the shape the backend already returns, not a
 * second model of it.
 *
 * THE ONE THING THIS FEATURE MUST NOT DO is decide anything. `impactLevel`,
 * `available` and every `reason` are the server's conclusions, rendered as
 * given. The frontend does not compute a level, does not merge rules, does not
 * infer availability from the presence of a record id it happens to hold, and
 * does not re-rank the list. A client that derived any of those would be a
 * second, unauthoritative impact engine — and the one that a user could edit.
 *
 * WHAT IS DELIBERATELY ABSENT: `selected`, `included`, or any default. Target
 * selection is the next phase's work. A field here that a checkbox could bind
 * to would be a promise this build does not keep.
 */

import type { RecordType } from './change-details.types';

/**
 * How strongly a dependent record should be corrected alongside the source.
 *
 * A closed union matching `public.change_impact_level`. The three are ordered
 * by strength — REQUIRED > RECOMMENDED > OPTIONAL — and the server has already
 * applied that ordering, both when merging rules and when sorting the list.
 */
export type ChangeImpactLevel = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

/**
 * One change the analysis is predicting the consequences of.
 *
 * Echoed by the API so the preview can state what it is describing. A page
 * listing four affected records without naming the change that affects them
 * would ask somebody to accept a consequence whose cause is off-screen.
 *
 * Both values are `unknown` because the source decides their type — render
 * them through `formatFieldValue`, never directly.
 */
export interface ImpactChangedField {
  readonly fieldKey: string;
  /** What the source held when the draft was created. */
  readonly oldValue: unknown;
  /** What the citizen is asking for. */
  readonly proposedValue: unknown;
}

/**
 * One reason a record is affected.
 *
 * A list of these hangs off each impact because a record reached by two
 * different corrections genuinely has two causes, and collapsing them would
 * either drop a true statement or invent a combined one no rule makes.
 *
 * `impactLevel` here is the level of THIS reason, before the server merged it —
 * kept so the strongest cause is identifiable, not only the merged result.
 */
export interface ImpactReason {
  readonly fieldKey: string;
  readonly impactLevel: ChangeImpactLevel;
  /** Citizen-facing text authored as configuration. Rendered verbatim. */
  readonly reason: string;
}

/**
 * One affected record, as the API returns it.
 *
 * ONE PER RECORD TYPE — the server merges every rule that reached a record into
 * a single entry, so this list never contains two cards for one certificate.
 * The frontend does not deduplicate, because there is nothing left to
 * deduplicate.
 *
 * `available` is the honest half. A rule says a record type would be affected;
 * whether this citizen HOLDS such a record is a separate fact. An unavailable
 * target still appears — with `recordId: null` — because "this change cannot
 * reach your bank details" is information the citizen needs, and hiding it
 * would imply the correction reaches everywhere it should.
 */
export interface ChangeImpact {
  readonly recordType: RecordType;
  /** The citizen's own record of this type, or `null` when they hold none. */
  readonly recordId: string | null;
  readonly available: boolean;
  /** The strongest level among the rules that reached this record. */
  readonly impactLevel: ChangeImpactLevel;
  /** Every reason, strongest first. Never empty. */
  readonly reasons: readonly ImpactReason[];
  /** `null` for a provider such as the bank, which has no officer queue. */
  readonly responsibleDepartment: { readonly code: string; readonly name: string } | null;
}

/**
 * The impact analysis of one draft.
 *
 * Note what is absent: no status, no target id, no consent and no selection.
 * The response describes what the server knows about consequences and stops
 * there, and so does the screen that renders it.
 */
export interface ChangeImpactAnalysis {
  readonly changeRequestId: string;
  readonly sourceRecord: {
    readonly recordId: string;
    readonly recordType: RecordType;
  };
  readonly changedFields: readonly ImpactChangedField[];
  /** One entry per affected record. Empty when nothing else is affected. */
  readonly impacts: readonly ChangeImpact[];
}
