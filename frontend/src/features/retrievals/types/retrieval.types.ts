/**
 * Phase 8 produces SUCCESS and FAILED. The database enum also carries PENDING,
 * IN_PROGRESS, TIMEOUT and RETRYING; none is produced by this phase, so none
 * appears here.
 */
export type RetrievalStatus = 'SUCCESS' | 'FAILED';

/**
 * What the citizen may do with one requirement right now.
 *
 * Derived entirely by the server from stored consent and retrieval rows. The
 * client renders this; it never computes it, because deciding locally whether a
 * retrieval is allowed would put an authorization judgement in the browser.
 */
export type RetrievalAvailability =
  | 'AVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_DENIED'
  | 'COMPLETED'
  | 'RETRYABLE'
  | 'NOT_SUPPORTED';

export interface RetrievedValue {
  readonly label: string;
  readonly value: string;
}

export interface RetrievalItem {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly information: string;
  readonly source: string;
  readonly isSimulated: boolean;
  readonly availability: RetrievalAvailability;
  readonly status: RetrievalStatus | null;
  readonly documentType: string | null;
  readonly providerReference: string | null;
  readonly issuer: string | null;
  readonly retrievedAt: string | null;
  readonly values: readonly RetrievedValue[];
  readonly failureReason: string | null;
}

export interface ApplicationRetrievalPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  readonly items: readonly RetrievalItem[];
}
