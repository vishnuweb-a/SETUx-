/**
 * Phase 7 implements PENDING → GRANTED | DENIED. The database enum also carries
 * REVOKED and EXPIRED; neither is produced by this phase, so neither appears
 * here.
 */
export type ConsentStatus = 'PENDING' | 'GRANTED' | 'DENIED';

export interface ConsentRequest {
  readonly id: string;
  readonly applicationId: string;
  /** What is being requested, in the citizen's words. */
  readonly information: string;
  readonly description: string | null;
  /** The government system it would come from. */
  readonly source: string;
  readonly purpose: string;
  readonly status: ConsentStatus;
  readonly decidedAt: string | null;
}

export interface ApplicationConsentContext {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  readonly recipient: string;
  readonly applicationStatus: string;
}

export interface ApplicationConsentPayload {
  readonly application: ApplicationConsentContext;
  readonly consents: readonly ConsentRequest[];
  readonly isDecisionRequired: boolean;
}
