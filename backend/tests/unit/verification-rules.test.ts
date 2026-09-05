import { describe, expect, it } from 'vitest';
import { listRules, resolveRule } from '../../src/modules/verifications/verification.rules.js';
import {
  VERIFICATION_REASON,
  VERIFICATION_STATUS,
  type EvidenceBundle,
  type EvidenceField,
} from '../../src/modules/verifications/verification.types.js';

/**
 * The verification rules, evaluated directly.
 *
 * These tests exist because the rules ARE the phase. Everything else in Phase 10
 * is plumbing that moves an outcome from here to the database; this file is
 * where SetuX decides what evidence means, so each rule is exercised against
 * passing, failing, missing and malformed evidence rather than only the happy
 * path (§50).
 *
 * No database, no HTTP, no connector — the rules are pure functions over stored
 * values, and that is precisely what makes this possible.
 */

const bundle = (fields: Readonly<Record<string, string>>): EvidenceBundle => ({
  byFieldCode: new Map(
    Object.entries(fields).map(
      ([fieldCode, value]) =>
        [
          fieldCode,
          {
            fieldCode,
            value,
            sourceId: '11111111-1111-4111-8111-111111111111',
            sourceType: 'PROVIDER_RETRIEVAL',
          } satisfies EvidenceField,
        ] as const,
    ),
  ),
});

/** The evidence Phase 9's connectors actually produce, per requirement (§53). */
const PASSING_EVIDENCE = {
  IDENTITY: { identityMatch: 'MATCHED', identityRecordStatus: 'ACTIVE' },
  INCOME_RECORD: { incomeBand: 'BELOW_THRESHOLD' },
  EDUCATION_RECORD: { educationEnrolmentStatus: 'ENROLLED' },
  BANK_DETAILS: { bankAccountStatus: 'ACTIVE' },
} as const;

describe('verification rules — registry', () => {
  it('registers exactly one rule per seeded requirement code', () => {
    const codes = listRules().map((rule) => rule.requirementCode).sort();
    expect(codes).toEqual([
      'BANK_DETAILS',
      'COMMUNITY_RECORD',
      'EDUCATION_RECORD',
      'IDENTITY',
      'INCOME_RECORD',
    ]);
  });

  it('gives every rule a distinct, versioned rule code', () => {
    // A stored outcome names the rule that produced it. Two rules sharing a code
    // would make a verification unattributable.
    const ruleCodes = listRules().map((rule) => rule.ruleCode);
    expect(new Set(ruleCodes).size).toBe(ruleCodes.length);
    for (const ruleCode of ruleCodes) expect(ruleCode).toMatch(/_V\d+$/u);
  });

  it('returns null for a requirement code it does not know', () => {
    expect(resolveRule('SOMETHING_ELSE')).toBeNull();
  });
});

describe('verification rules — passing evidence', () => {
  it.each(Object.entries(PASSING_EVIDENCE))(
    '%s verifies against the evidence Phase 9 produces',
    (requirementCode, evidence) => {
      const outcome = resolveRule(requirementCode)!.evaluate(bundle(evidence));
      expect(outcome.status).toBe(VERIFICATION_STATUS.VERIFIED);
      expect(outcome.reasonCode).toBe(VERIFICATION_REASON.RULE_MATCH);
      // The fields the rule read are named, so the evidence status update can be
      // scoped to exactly what was judged.
      expect(outcome.fieldCodes.length).toBeGreaterThan(0);
    },
  );

  it('is deterministic — the same evidence always yields the same outcome', () => {
    const rule = resolveRule('IDENTITY')!;
    const evidence = bundle(PASSING_EVIDENCE.IDENTITY);
    const runs = Array.from({ length: 5 }, () => rule.evaluate(evidence));
    for (const run of runs) expect(run).toEqual(runs[0]);
  });

  it('compares categorically, not case-sensitively', () => {
    const outcome = resolveRule('IDENTITY')!.evaluate(
      bundle({ identityMatch: 'matched', identityRecordStatus: 'Active' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.VERIFIED);
  });
});

describe('verification rules — failing evidence', () => {
  it('fails identity when the registry did not match', () => {
    const outcome = resolveRule('IDENTITY')!.evaluate(
      bundle({ identityMatch: 'NOT_MATCHED', identityRecordStatus: 'ACTIVE' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.FAILED);
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.RULE_MISMATCH);
  });

  it('fails identity when the record matched but is no longer active', () => {
    // The provider's own `MATCHED` is not sufficient. This is the case that
    // proves SetuX evaluates evidence rather than copying the provider's
    // verdict through (§14).
    const outcome = resolveRule('IDENTITY')!.evaluate(
      bundle({ identityMatch: 'MATCHED', identityRecordStatus: 'RETIRED' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.FAILED);
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.RULE_MISMATCH);
  });

  it('fails income when the household is not below the certified threshold', () => {
    const outcome = resolveRule('INCOME_RECORD')!.evaluate(
      bundle({ incomeBand: 'ABOVE_THRESHOLD' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.FAILED);
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.RULE_MISMATCH);
  });

  it('fails education when enrolment has lapsed', () => {
    const outcome = resolveRule('EDUCATION_RECORD')!.evaluate(
      bundle({ educationEnrolmentStatus: 'WITHDRAWN' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.FAILED);
  });

  it('fails bank details when the account is not active', () => {
    const outcome = resolveRule('BANK_DETAILS')!.evaluate(
      bundle({ bankAccountStatus: 'CLOSED' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.FAILED);
  });

  it('never reports a failure as an application rejection', () => {
    // FAILED is a finding about one requirement. Phase 10 has no vocabulary for
    // rejecting an application, and must not acquire one (§15).
    for (const rule of listRules()) {
      const outcome = rule.evaluate(bundle({ identityMatch: 'NO', incomeBand: 'NO' }));
      expect(['VERIFIED', 'FAILED', 'REQUIRES_ACTION']).toContain(outcome.status);
    }
  });
});

describe('verification rules — missing evidence', () => {
  it.each(Object.keys(PASSING_EVIDENCE))(
    '%s requires action when its evidence is absent',
    (requirementCode) => {
      const outcome = resolveRule(requirementCode)!.evaluate(bundle({}));
      expect(outcome.status).toBe(VERIFICATION_STATUS.REQUIRES_ACTION);
      expect(outcome.reasonCode).toBe(VERIFICATION_REASON.EVIDENCE_MISSING);
    },
  );

  it('does not claim to have evaluated fields when evidence was missing', () => {
    // Nothing was judged, so nothing may have its stored status moved (§26).
    const outcome = resolveRule('IDENTITY')!.evaluate(
      bundle({ identityMatch: 'MATCHED' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.REQUIRES_ACTION);
    expect(outcome.fieldCodes).toEqual([]);
  });

  it('treats a blank value as missing rather than as a mismatch', () => {
    // An empty string is not evidence. Reporting RULE_MISMATCH would state that
    // SetuX read something and disagreed with it, which would be untrue.
    const outcome = resolveRule('INCOME_RECORD')!.evaluate(bundle({ incomeBand: '   ' }));
    expect(outcome.status).toBe(VERIFICATION_STATUS.REQUIRES_ACTION);
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.EVIDENCE_MISSING);
  });

  it('distinguishes missing evidence from evidence that disagrees', () => {
    const missing = resolveRule('INCOME_RECORD')!.evaluate(bundle({}));
    const mismatched = resolveRule('INCOME_RECORD')!.evaluate(
      bundle({ incomeBand: 'ABOVE_THRESHOLD' }),
    );
    expect(missing.reasonCode).not.toBe(mismatched.reasonCode);
    expect(missing.status).not.toBe(mismatched.status);
  });
});

describe('verification rules — no threshold is invented', () => {
  it('does not judge the education aggregate percentage', () => {
    // No seeded scholarship states a required mark, so a low aggregate must not
    // fail the rule. Judging it would be SetuX inventing eligibility policy
    // (§13).
    const low = resolveRule('EDUCATION_RECORD')!.evaluate(
      bundle({ educationEnrolmentStatus: 'ENROLLED', educationAggregatePercentage: '31.0' }),
    );
    const high = resolveRule('EDUCATION_RECORD')!.evaluate(
      bundle({ educationEnrolmentStatus: 'ENROLLED', educationAggregatePercentage: '99.9' }),
    );
    expect(low.status).toBe(VERIFICATION_STATUS.VERIFIED);
    expect(high.status).toBe(VERIFICATION_STATUS.VERIFIED);
    expect(low.fieldCodes).not.toContain('educationAggregatePercentage');
  });

  it('does not judge which community category qualifies', () => {
    // Present and readable, but SetuX holds no list of qualifying categories.
    // REQUIRES_ACTION states honestly that it was not checked, rather than
    // VERIFIED overstating what happened.
    const outcome = resolveRule('COMMUNITY_RECORD')!.evaluate(
      bundle({ communityCategory: 'OBC', communityCertificateNumber: 'SYNTH-COM-1' }),
    );
    expect(outcome.status).toBe(VERIFICATION_STATUS.REQUIRES_ACTION);
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.NO_RULE_DEFINED);
  });

  it('still detects a community certificate that is absent entirely', () => {
    const outcome = resolveRule('COMMUNITY_RECORD')!.evaluate(bundle({}));
    expect(outcome.reasonCode).toBe(VERIFICATION_REASON.EVIDENCE_MISSING);
  });
});

describe('verification rules — independence from connectors', () => {
  it('evaluates from stored values alone', async () => {
    // The rules module must not import a connector. This is the structural half
    // of §18: an import here would let a rule reach a provider, bypassing the
    // consent gate that governs retrieval.
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL('../../src/modules/verifications/verification.rules.ts', import.meta.url),
        'utf8',
      ),
    );
    expect(source).not.toMatch(/from '.*connector/u);
    expect(source).not.toMatch(/Connector\b/u);
  });
});
