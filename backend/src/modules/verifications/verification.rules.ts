/**
 * The verification rules.
 *
 * This file is the whole of SetuX's judgement about evidence. It is deliberately
 * separate from the service that runs it and the repository that persists it, so
 * a rule can be read, reviewed and unit-tested without a database or an HTTP
 * request in sight.
 *
 * Three constraints shape everything here.
 *
 * 1. A CONNECTOR RESULT IS NOT A VERIFICATION RESULT (§14).
 *    The identity registry returning `identityMatch = MATCHED` is the
 *    registry's statement about its own record. SetuX still has to decide what
 *    that means, and it decides it here, explicitly. The rules below could
 *    reach a different conclusion from the provider's — that possibility is the
 *    point. Copying `MATCHED` straight through to VERIFIED would make this
 *    layer decorative.
 *
 * 2. NO THRESHOLD IS INVENTED (§13).
 *    The repository defines no income limit, no marks minimum and no age bound
 *    — not in `services`, not in `service_requirements`, not in the seed, not
 *    in the docs. So no rule here compares a number against one. Where a
 *    judgement would need a threshold SetuX does not have, the rule returns
 *    REQUIRES_ACTION with NO_RULE_DEFINED and the officer decides in Phase 11.
 *
 *    This is why the education rule reads `educationEnrolmentStatus` and not
 *    `educationAggregatePercentage`. The aggregate is retrieved and shown to
 *    the citizen; it is not judged, because nothing in SetuX says what
 *    aggregate is good enough.
 *
 * 3. RULES ARE CATEGORICAL AND DETERMINISTIC.
 *    Every rule reads stored strings and compares them against a fixed set of
 *    accepted values. No model, no scoring, no randomness, no clock — the same
 *    evidence always yields the same outcome, which is what makes a stored
 *    verification reproducible and therefore auditable.
 *
 * The providers' own vocabulary is what makes this workable: the fake revenue
 * department already answers the means test as a band (`BELOW_THRESHOLD`)
 * rather than a figure, precisely so a consumer need not hold a threshold to
 * act on it (government-connector.md §13).
 */
import {
  VERIFICATION_REASON,
  VERIFICATION_STATUS,
  type EvidenceBundle,
  type RuleOutcome,
  type VerificationRule,
} from './verification.types.js';

/**
 * Reads one stored field.
 *
 * Returns null for a field that is absent OR present-but-blank. A field
 * retrieved as an empty string is not evidence of anything, and treating it as
 * present would let a rule "pass" on nothing.
 */
const read = (evidence: EvidenceBundle, fieldCode: string): string | null => {
  const field = evidence.byFieldCode.get(fieldCode);
  if (!field) return null;
  const trimmed = field.value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * The shape every categorical rule shares: read the named fields, require all
 * of them, then compare each against its accepted values.
 *
 * Missing evidence and mismatched evidence are kept distinct all the way to the
 * citizen, because they mean different things and lead to different remedies —
 * one is "we do not have this yet", the other is "we have it and it does not
 * agree" (§16, §17).
 */
const categoricalRule = (params: {
  readonly ruleCode: string;
  readonly requirementCode: string;
  /** Field code → the values that satisfy the rule, compared case-insensitively. */
  readonly expectations: Readonly<Record<string, readonly string[]>>;
}): VerificationRule => ({
  ruleCode: params.ruleCode,
  requirementCode: params.requirementCode,
  evaluate: (evidence: EvidenceBundle): RuleOutcome => {
    const fieldCodes = Object.keys(params.expectations);
    const values = fieldCodes.map((fieldCode) => [fieldCode, read(evidence, fieldCode)] as const);

    const missing = values.filter(([, value]) => value === null).map(([fieldCode]) => fieldCode);
    if (missing.length > 0) {
      return {
        status: VERIFICATION_STATUS.REQUIRES_ACTION,
        reasonCode: VERIFICATION_REASON.EVIDENCE_MISSING,
        // The fields that WERE present are not claimed as evaluated: the rule
        // never reached a conclusion about them, so their stored status must
        // not move (§26).
        fieldCodes: [],
      };
    }

    const satisfied = values.every(([fieldCode, value]) =>
      params.expectations[fieldCode]!.some(
        (accepted) => accepted.toLowerCase() === value!.toLowerCase(),
      ),
    );

    return satisfied
      ? {
          status: VERIFICATION_STATUS.VERIFIED,
          reasonCode: VERIFICATION_REASON.RULE_MATCH,
          fieldCodes,
        }
      : {
          // RULE_MISMATCH is a genuine negative finding: the evidence was read
          // and disagreed. It is still not a rejection — Phase 11 decides what
          // a mismatch means for the application (§15).
          status: VERIFICATION_STATUS.FAILED,
          reasonCode: VERIFICATION_REASON.RULE_MISMATCH,
          fieldCodes,
        };
  },
});

/**
 * IDENTITY — the registry confirmed a match against a live record.
 *
 * Both conditions are required. A MATCHED result against a record the registry
 * has since retired says the person exists but the record is not current, and
 * SetuX treats that as not verified rather than papering over it.
 */
const identityRule = categoricalRule({
  ruleCode: 'IDENTITY_MATCHED_ACTIVE_V1',
  requirementCode: 'IDENTITY',
  expectations: {
    identityMatch: ['MATCHED'],
    identityRecordStatus: ['ACTIVE'],
  },
});

/**
 * INCOME_RECORD — the certifying department placed the household below the
 * threshold it applies.
 *
 * SetuX holds no income figure and no limit of its own; the revenue department
 * certifies which side of its own threshold the household falls on, and this
 * rule verifies that SetuX received that certification. Note what this does NOT
 * claim: it does not assert the household qualifies for this particular
 * scholarship, because no scholarship in the catalogue states an income ceiling.
 */
const incomeRule = categoricalRule({
  ruleCode: 'INCOME_BAND_BELOW_THRESHOLD_V1',
  requirementCode: 'INCOME_RECORD',
  expectations: {
    incomeBand: ['BELOW_THRESHOLD'],
  },
});

/**
 * EDUCATION_RECORD — the board confirms a current enrolment.
 *
 * Enrolment status is judged; the aggregate percentage is not. Every seeded
 * scholarship asks for an education record, and none states a required mark, so
 * a rule comparing `educationAggregatePercentage` against any number would be
 * inventing the eligibility policy rather than applying it (§13). The aggregate
 * is retrieved, stored and shown — the officer weighs it in Phase 11.
 */
const educationRule = categoricalRule({
  ruleCode: 'EDUCATION_ENROLMENT_CURRENT_V1',
  requirementCode: 'EDUCATION_RECORD',
  expectations: {
    educationEnrolmentStatus: ['ENROLLED', 'PASSED', 'COMPLETED'],
  },
});

/**
 * BANK_DETAILS — the account that would receive a disbursement is usable.
 *
 * A structural check, which is all a bank proof supports: SetuX cannot confirm
 * an account belongs to the applicant without a name-matching rule the product
 * has not defined, so it confirms the account is active and leaves ownership to
 * the officer.
 */
const bankRule = categoricalRule({
  ruleCode: 'BANK_ACCOUNT_ACTIVE_V1',
  requirementCode: 'BANK_DETAILS',
  expectations: {
    bankAccountStatus: ['ACTIVE'],
  },
});

/**
 * COMMUNITY_RECORD — a community certificate was issued and identifies a
 * category.
 *
 * Presence and readability only, and deliberately so. Which categories qualify
 * for `SCHOLARSHIP_MINORITY` is policy that the seeded catalogue does not state,
 * so this rule confirms SetuX holds a certificate naming a category and stops
 * there. Judging the category itself would be inventing the eligibility list.
 */
const communityRule: VerificationRule = {
  ruleCode: 'COMMUNITY_CERTIFICATE_PRESENT_V1',
  requirementCode: 'COMMUNITY_RECORD',
  evaluate: (evidence: EvidenceBundle): RuleOutcome => {
    const category = read(evidence, 'communityCategory');
    const certificate = read(evidence, 'communityCertificateNumber');

    if (!category || !certificate) {
      return {
        status: VERIFICATION_STATUS.REQUIRES_ACTION,
        reasonCode: VERIFICATION_REASON.EVIDENCE_MISSING,
        fieldCodes: [],
      };
    }

    // Present and readable, but SetuX has no list of qualifying categories to
    // check it against. That is an honest REQUIRES_ACTION rather than a
    // VERIFIED that would overstate what was actually checked.
    return {
      status: VERIFICATION_STATUS.REQUIRES_ACTION,
      reasonCode: VERIFICATION_REASON.NO_RULE_DEFINED,
      fieldCodes: ['communityCategory', 'communityCertificateNumber'],
    };
  },
};

const RULES: readonly VerificationRule[] = [
  identityRule,
  incomeRule,
  educationRule,
  bankRule,
  communityRule,
];

const RULES_BY_REQUIREMENT: ReadonlyMap<string, VerificationRule> = new Map(
  RULES.map((rule) => [rule.requirementCode, rule]),
);

/**
 * The rule for one requirement code, or null when none is configured.
 *
 * A requirement with no rule is not an error and not a failure. The service
 * records REQUIRES_ACTION / NO_RULE_DEFINED for it, which states plainly that
 * SetuX did not check it — far better than silently omitting it and letting the
 * overview imply everything was examined.
 */
export const resolveRule = (requirementCode: string): VerificationRule | null =>
  RULES_BY_REQUIREMENT.get(requirementCode) ?? null;

/** Every configured rule. Exported for the registry's own tests. */
export const listRules = (): readonly VerificationRule[] => RULES;
