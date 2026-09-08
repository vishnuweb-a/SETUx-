/**
 * Change & Correction Service — dependency & impact detection (Phase 5).
 *
 * Given a citizen's saved DRAFT, determines which of their OTHER records hold
 * the same fact and would be left disagreeing with the source, and how strongly
 * each one matters.
 *
 * READ-ONLY, entirely. Nothing in this module writes: no target is created, no
 * consent is derived, no status moves, and the draft and every government
 * record are exactly as they were. Target selection, consent, routing and
 * review are Phase 6 and later, and none of them is modelled here.
 */

export { handleGetChangeImpact } from './change-impact.controller.js';
export { getChangeImpact } from './change-impact.service.js';
export {
  CHANGE_IMPACT_LEVEL,
  IMPACT_LEVEL_RANK,
  strongerImpactLevel,
  type ChangeImpact,
  type ChangeImpactAnalysis,
  type ChangeImpactLevel,
  type DependencyRuleRow,
  type ImpactChangedField,
  type ImpactReason,
} from './change-impact.types.js';
