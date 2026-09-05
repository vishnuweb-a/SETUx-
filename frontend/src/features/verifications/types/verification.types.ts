/**
 * Phase 10 produces VERIFIED, FAILED and REQUIRES_ACTION.
 *
 * The database `verification_status` enum also carries PENDING and PROCESSING.
 * PROCESSING is never written — runs are synchronous, so no application is
 * observably mid-run — and PENDING only ever appears as "not yet evaluated",
 * which this client models as a null status instead. Listing a value the API
 * cannot return would be a promise the contract does not keep.
 */
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'REQUIRES_ACTION';

/**
 * Why a rule reached its outcome.
 *
 * Structured codes, never prose and never an evidence value — they are read by
 * people not entitled to the underlying evidence.
 */
export type VerificationReason =
  | 'RULE_MATCH'
  | 'RULE_MISMATCH'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_UNREADABLE'
  | 'NO_RULE_DEFINED';

/**
 * Whether verification may start.
 *
 * Server-derived from stored rows. The client renders this and never computes
 * it: deciding locally whether evidence is complete would put an authorization
 * judgement in the browser, and a citizen who could flip it would be asking the
 * server to verify an application it had already refused (§16).
 */
export type VerificationReadiness =
  | 'READY'
  | 'NOT_SUBMITTED'
  | 'EVIDENCE_INCOMPLETE'
  | 'ALREADY_STARTED';

export interface VerificationItem {
  readonly requirementCode: string;
  readonly information: string;
  readonly required: boolean;
  /** Null until a rule has evaluated this requirement. */
  readonly status: VerificationStatus | null;
  readonly reasonCode: VerificationReason | null;
  readonly verifiedAt: string | null;
}

/**
 * The verification overview.
 *
 * Note what is absent: no evidence values, no rule internals, no source ids.
 * The citizen is told what SetuX concluded and why, not what it read to get
 * there — the evidence itself is already shown by the retrieval panel under its
 * own authorization (§21).
 */
export interface ApplicationVerificationPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  readonly readiness: VerificationReadiness;
  readonly items: readonly VerificationItem[];
  /** Requirements with a VERIFIED outcome, and the total the service asks for. */
  readonly verifiedCount: number;
  readonly totalCount: number;
}
