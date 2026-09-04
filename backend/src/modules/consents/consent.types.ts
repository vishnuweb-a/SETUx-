import type { Enums } from '../../database/index.js';

export type ConsentStatus = Enums<'consent_status'>;

/**
 * The consent states Phase 7 implements.
 *
 * `consent_status` also carries REVOKED and EXPIRED. Both stay in the schema —
 * Phase 7 neither implements nor removes them (Phase 7 §14).
 */
export const CONSENT_STATUS = {
  PENDING: 'PENDING',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
} as const satisfies Partial<Record<ConsentStatus, ConsentStatus>>;

/** What the citizen is being asked to authorize, normalized for the UI. */
export interface ConsentRequest {
  readonly id: string;
  readonly applicationId: string;
  /** The information itself — "Income Certificate", not a source code. */
  readonly information: string;
  readonly description: string | null;
  /** The simulated government system the data would come from. */
  readonly source: string;
  readonly purpose: string;
  readonly status: ConsentStatus;
  readonly decidedAt: string | null;
}

export interface ApplicationConsentContext {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  /** Who receives the data — the department offering the service. */
  readonly recipient: string;
  readonly applicationStatus: string;
}

export interface ApplicationConsentPayload {
  readonly application: ApplicationConsentContext;
  readonly consents: readonly ConsentRequest[];
  /** True while any consent is still awaiting the citizen's decision. */
  readonly isDecisionRequired: boolean;
}

export interface ConsentRow {
  readonly id: string;
  readonly application_id: string;
  readonly citizen_id: string;
  readonly data_source_id: string;
  readonly purpose: string;
  readonly status: ConsentStatus;
  readonly decided_at: string | null;
  readonly granted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
