import type { ChangeImpactLevel } from '../types/change-impact.types';

/**
 * Presentation vocabulary for the impact preview (Phase 5).
 *
 * Centralised for the reason `record-presentation.ts` states: labels scattered
 * through JSX drift apart, and a citizen reading a page about their own legal
 * records notices when the same idea is worded two ways.
 *
 * These are presentation only. Nothing here decides an impact level, merges
 * rules or infers availability — all three are the server's conclusions, and
 * this file only chooses the words and the badge for one that has already been
 * decided.
 */

const IMPACT_LEVEL_LABELS: Readonly<Record<ChangeImpactLevel, string>> = {
  REQUIRED: 'Required',
  RECOMMENDED: 'Recommended',
  OPTIONAL: 'Optional',
};

/**
 * What each level MEANS, in the citizen's terms.
 *
 * The badge is a word; this is the sentence that makes the word actionable. It
 * sits beside the rule's own reason rather than replacing it: the reason says
 * why THIS record is affected, and this says what the level asks of them in
 * general.
 *
 * None of these promises that acting on the impact is possible yet. Selecting
 * targets and sending them to a department is the next stage, and a description
 * that said "this will be updated" would describe something this build does not
 * do.
 */
const IMPACT_LEVEL_DESCRIPTIONS: Readonly<Record<ChangeImpactLevel, string>> = {
  REQUIRED:
    'This record holds the same detail and should be corrected as well, or the two records will disagree.',
  RECOMMENDED:
    'Correcting this record as well would help avoid a mismatch later. It is your choice.',
  // Deliberately does NOT repeat "held outside government systems" — the card
  // already states that beside the authority, and saying it twice on one card
  // reads as a rendering fault rather than as emphasis.
  OPTIONAL:
    'This record may hold the same detail. Correcting it is entirely your choice.',
};

export const impactLevelLabel = (level: ChangeImpactLevel): string =>
  IMPACT_LEVEL_LABELS[level] ?? level;

export const impactLevelDescription = (level: ChangeImpactLevel): string =>
  IMPACT_LEVEL_DESCRIPTIONS[level] ?? '';
