/**
 * How a field's *server-decided* policy is presented.
 *
 * The one rule this module exists to hold: **editability is never computed
 * here**. Every function below reads `field.editability` and `field.changeable`
 * as the API returned them (docs/API/citizen-records.md §3). Nothing infers
 * that a certificate number "looks immutable", and nothing widens a policy.
 *
 * Selectability is `field.changeable` — a value the server derives and the
 * client only obeys. Even so, the client's list is a convenience, not an
 * authority: the phase that accepts a proposed value must call
 * `assertFieldEditable(recordType, fieldKey)` again server-side, because a
 * policy can change between this screen and that submission, and because a
 * forged client can send any key it likes.
 */

import type { BadgeProps } from '@/components/ui/badge';
import type { CitizenRecordField, FieldEditability } from '../types/change-details.types';

/** How one field is described to the citizen. */
export interface FieldEligibilityPresentation {
  /** Short badge text. Never the only signal — helper text always accompanies it. */
  readonly badgeLabel: string;
  readonly badgeVariant: NonNullable<BadgeProps['variant']>;
  /** A full sentence explaining what the citizen can or cannot do, and why. */
  readonly helperText: string;
  /** Whether the citizen may select this field for correction. */
  readonly isSelectable: boolean;
}

const EDITABILITY_BADGE_LABELS: Readonly<Record<FieldEditability, string>> = {
  EDITABLE: 'Editable',
  CONDITIONALLY_EDITABLE: 'Conditionally editable',
  IMMUTABLE: 'Locked',
};

const EDITABILITY_BADGE_VARIANTS: Readonly<
  Record<FieldEditability, NonNullable<BadgeProps['variant']>>
> = {
  EDITABLE: 'success',
  CONDITIONALLY_EDITABLE: 'warning',
  IMMUTABLE: 'secondary',
};

/**
 * What a conditionally-editable field additionally requires.
 *
 * Both requirements can hold at once, and saying so in one sentence is clearer
 * than two badges the citizen must combine themselves.
 */
const conditionalRequirementText = (field: CitizenRecordField): string => {
  if (field.requiresEvidence && field.requiresReview) {
    return 'This change requires supporting evidence and department review.';
  }
  if (field.requiresEvidence) return 'This change requires supporting evidence.';
  if (field.requiresReview) return 'This change requires department review.';

  // Conditional with neither requirement recorded. Say what is certain rather
  // than inventing a condition the policy does not state.
  return 'This change may need additional checks before it is accepted.';
};

/**
 * Why a locked field is locked, naming the authority that owns it where known.
 *
 * "This cannot be changed here, and here is who owns it" is a more useful
 * answer than hiding the field, which is why immutable fields stay on screen.
 */
const immutableText = (field: CitizenRecordField): string =>
  field.policyAuthority === null
    ? 'This field cannot be changed through SetuX.'
    : `This field cannot be changed through SetuX. It is maintained by ${field.policyAuthority}.`;

/**
 * The presentation for a field whose policy SetuX does not have.
 *
 * Treated exactly as locked, because that is what the server already decided:
 * an ungoverned field returns `changeable: false`. A field forgotten in a seed
 * must never become correctable by omission — the safety of the feature cannot
 * depend on the completeness of a policy table.
 */
const UNKNOWN_POLICY: FieldEligibilityPresentation = {
  badgeLabel: 'Not available for change',
  badgeVariant: 'secondary',
  helperText:
    'SetuX has no correction policy for this field yet, so it cannot be changed here.',
  isSelectable: false,
};

export const fieldEligibility = (field: CitizenRecordField): FieldEligibilityPresentation => {
  if (field.editability === null) return UNKNOWN_POLICY;

  const badgeLabel = EDITABILITY_BADGE_LABELS[field.editability];
  const badgeVariant = EDITABILITY_BADGE_VARIANTS[field.editability];

  // An editability the client does not recognise is treated as unknown, not
  // guessed at. A future policy class must not become silently selectable in an
  // older frontend.
  if (badgeLabel === undefined) return UNKNOWN_POLICY;

  if (field.editability === 'IMMUTABLE') {
    return {
      badgeLabel,
      badgeVariant,
      helperText: immutableText(field),
      // `changeable` is never trusted to overrule IMMUTABLE. The server derives
      // the two consistently; should they ever disagree, the restrictive half
      // wins here.
      isSelectable: false,
    };
  }

  return {
    badgeLabel,
    badgeVariant,
    helperText:
      field.editability === 'EDITABLE'
        ? 'You can request a change to this field.'
        : conditionalRequirementText(field),
    isSelectable: field.changeable,
  };
};
