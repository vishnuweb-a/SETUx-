import type { Enums } from '../../database/index.js';

export type VerificationStatus = Enums<'verification_status'>;

/**
 * The outcomes a Phase 10 rule can reach.
 *
 * `verification_status` also carries PROCESSING. It stays in the schema and is
 * deliberately not produced here: Phase 10 evaluates rules synchronously within
 * the request, so no application is ever observably mid-run, and a status no
 * code path writes is a promise the API does not keep (the reasoning Phase 8
 * applied to `retrieval_status`).
 *
 * REQUIRES_ACTION is the outcome that keeps the phase boundary honest. A rule
 * that cannot conclude — evidence missing, or present but with no business rule
 * defined to judge it — must not report FAILED, because FAILED reads as "this
 * citizen does not qualify" and that judgement belongs to the officer in
 * Phase 11 (§15, §43).
 */
export const VERIFICATION_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
} as const satisfies Partial<Record<VerificationStatus, VerificationStatus>>;

/**
 * Why a rule reached its outcome.
 *
 * Structured codes, never prose and never an evidence value. These are written
 * to `verifications.result` and to the timeline, both of which are read by
 * people who are not entitled to the underlying evidence (§27, §28).
 */
export const VERIFICATION_REASON = {
  /** The evidence was present and satisfied the rule. */
  RULE_MATCH: 'RULE_MATCH',
  /** The evidence was present and did not satisfy the rule. */
  RULE_MISMATCH: 'RULE_MISMATCH',
  /** The requirement's evidence has not been retrieved. */
  EVIDENCE_MISSING: 'EVIDENCE_MISSING',
  /** Evidence exists but is not in a shape this rule can read. */
  EVIDENCE_UNREADABLE: 'EVIDENCE_UNREADABLE',
  /**
   * Evidence is present and well-formed, but SetuX has no configured business
   * rule to judge it against. Used where a requirement would need a threshold
   * the repository never defines (§13).
   */
  NO_RULE_DEFINED: 'NO_RULE_DEFINED',
} as const;

export type VerificationReason = (typeof VERIFICATION_REASON)[keyof typeof VERIFICATION_REASON];

/** One stored, normalized evidence value. The rule engine's only input. */
export interface EvidenceField {
  readonly fieldCode: string;
  readonly value: string;
  readonly sourceId: string | null;
  readonly sourceType: string | null;
}

/**
 * Everything one rule may read.
 *
 * Deliberately a snapshot of stored rows, not a connector handle. A rule cannot
 * fetch anything, because there is nothing here to fetch with (§18).
 */
export interface EvidenceBundle {
  readonly byFieldCode: ReadonlyMap<string, EvidenceField>;
}

/** What a rule concludes about one requirement. */
export interface RuleOutcome {
  readonly status: VerificationStatus;
  readonly reasonCode: VerificationReason;
  /** Which stored fields the rule actually read. Drives the evidence status update. */
  readonly fieldCodes: readonly string[];
}

/**
 * One requirement's verification rule.
 *
 * `ruleCode` is persisted alongside the outcome so a stored verification says
 * which version of which rule produced it — an outcome whose rule cannot be
 * identified is not auditable.
 */
export interface VerificationRule {
  readonly ruleCode: string;
  readonly requirementCode: string;
  readonly evaluate: (evidence: EvidenceBundle) => RuleOutcome;
}

/** A requirement of the application's service, as verification sees it. */
export interface VerifiableRequirement {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly name: string;
  readonly dataSourceId: string | null;
  readonly required: boolean;
  readonly displayOrder: number;
}

/** One requirement's outcome, ready to persist. */
export interface RequirementVerification {
  readonly requirementCode: string;
  readonly status: VerificationStatus;
  readonly reasonCode: VerificationReason;
  readonly ruleCode: string;
  readonly sourceId: string | null;
  readonly fieldCodes: readonly string[];
}

/**
 * Why verification cannot start yet.
 *
 * Server-derived from stored rows, never accepted from a request (§10).
 */
export const VERIFICATION_READINESS = {
  /** Every required, provider-backed requirement has its evidence. */
  READY: 'READY',
  /** The application has not been submitted. */
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  /** At least one required requirement has no retrieved evidence. */
  EVIDENCE_INCOMPLETE: 'EVIDENCE_INCOMPLETE',
  /** Verification has already run for this application. */
  ALREADY_STARTED: 'ALREADY_STARTED',
} as const;

export type VerificationReadiness =
  (typeof VERIFICATION_READINESS)[keyof typeof VERIFICATION_READINESS];

/** One requirement's verification state, safe to show the citizen. */
export interface VerificationItem {
  readonly requirementCode: string;
  /** "Identity Verification" — the citizen's words, from configuration. */
  readonly information: string;
  readonly required: boolean;
  readonly status: VerificationStatus | null;
  readonly reasonCode: VerificationReason | null;
  readonly verifiedAt: string | null;
}

/**
 * The verification overview.
 *
 * Note what is absent: no evidence values, no rule internals, no source ids.
 * The citizen is told what SetuX concluded and why, not what it read to get
 * there — the evidence itself is already shown by the Phase 8 retrieval view
 * under its own authorization.
 */
export interface VerificationPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  readonly readiness: VerificationReadiness;
  readonly items: readonly VerificationItem[];
  /** Requirements with a VERIFIED outcome, over those a rule can judge. */
  readonly verifiedCount: number;
  readonly totalCount: number;
}

export interface VerificationRow {
  readonly id: string;
  readonly application_id: string;
  readonly verification_type: string;
  readonly status: VerificationStatus;
  readonly source_id: string | null;
  readonly result: unknown;
  readonly verified_at: string | null;
  readonly created_at: string;
}
