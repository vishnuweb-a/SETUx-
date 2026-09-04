import type { Enums } from '../../database/index.js';

export type RetrievalStatus = Enums<'retrieval_status'>;

/**
 * The statuses Phase 8 produces.
 *
 * `retrieval_status` also carries PENDING, IN_PROGRESS, TIMEOUT and RETRYING.
 * All stay in the schema; Phase 8 neither produces nor removes them, because a
 * status no code path can write is a promise the API does not keep.
 */
export const RETRIEVAL_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const satisfies Partial<Record<RetrievalStatus, RetrievalStatus>>;

/**
 * Why a retrieval cannot be offered right now.
 *
 * This is the citizen-facing state of one requirement, derived entirely from
 * stored rows. It is what lets the UI show the right thing without the client
 * deciding anything: a DENIED consent must not be offered a "Fetch" button
 * (Phase 8 §31).
 */
export const RETRIEVAL_AVAILABILITY = {
  /** Consent is GRANTED and nothing has been retrieved yet. */
  AVAILABLE: 'AVAILABLE',
  /** Consent exists but is still PENDING — the citizen has not decided. */
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  /** The citizen said no. No retrieval action is offered. */
  CONSENT_DENIED: 'CONSENT_DENIED',
  /** Already retrieved successfully. */
  COMPLETED: 'COMPLETED',
  /** The last attempt failed and may be retried. */
  RETRYABLE: 'RETRYABLE',
  /** No connector serves this source in this phase. */
  NOT_SUPPORTED: 'NOT_SUPPORTED',
} as const;

export type RetrievalAvailability =
  (typeof RETRIEVAL_AVAILABILITY)[keyof typeof RETRIEVAL_AVAILABILITY];

/** One normalized value, safe to show the citizen. */
export interface RetrievedValue {
  readonly label: string;
  readonly value: string;
}

/**
 * One retrievable requirement and its current state.
 *
 * Note what is absent: no consent id, no data source id, no raw provider
 * payload. The client is given what it needs to render and to name the next
 * action, and nothing it could use to widen its own authorization.
 */
export interface RetrievalItem {
  readonly requirementId: string;
  readonly requirementCode: string;
  /** "Bank Account Proof" — the citizen's words, from configuration. */
  readonly information: string;
  /** "DigiLocker (Mock)" — the simulated system it comes from. */
  readonly source: string;
  /** True for every Phase 8 source. The UI says so rather than implying a real integration. */
  readonly isSimulated: boolean;
  readonly availability: RetrievalAvailability;
  readonly status: RetrievalStatus | null;
  readonly documentType: string | null;
  readonly providerReference: string | null;
  readonly issuer: string | null;
  readonly retrievedAt: string | null;
  readonly values: readonly RetrievedValue[];
  /** A safe, human-readable reason. Never a stack trace or provider internals. */
  readonly failureReason: string | null;
}

export interface ApplicationRetrievalPayload {
  readonly applicationId: string;
  readonly applicationNumber: string;
  readonly serviceName: string;
  readonly items: readonly RetrievalItem[];
}

export interface RetrievalRow {
  readonly id: string;
  readonly application_id: string;
  readonly data_source_id: string;
  readonly consent_id: string | null;
  readonly requirement_id: string | null;
  readonly request_reference: string | null;
  readonly status: RetrievalStatus;
  readonly attempt_number: number;
  readonly response_metadata: unknown;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
}

/** A requirement joined to its source and the consent covering it. */
export interface RetrievableRequirement {
  readonly requirementId: string;
  readonly requirementCode: string;
  readonly information: string;
  readonly dataSourceId: string;
  readonly sourceCode: string;
  readonly sourceName: string;
  readonly consentStatus: string | null;
  readonly displayOrder: number;
}
