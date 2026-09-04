/**
 * The contract every government data connector implements.
 *
 * SetuX business code depends on this file and never on a provider module.
 * That is the whole point of the boundary: the fake DigiLocker connector Phase 8
 * ships and a real integration added later are interchangeable here, so the
 * retrieval service does not change when the provider does
 * (docs/INTEGRATIONS/government-connector.md §4, §38).
 */

/** What SetuX asks a provider for. Derived server-side; none of it is client input. */
export interface ConnectorRequest {
  /**
   * The requirement being satisfied, e.g. `BANK_DETAILS`. Comes from
   * `service_requirements.requirement_code`, so the set of things a connector
   * can be asked for is database-driven rather than hard-coded.
   */
  readonly requirementCode: string;
  /**
   * Correlates the attempt across the retrieval row, the event and the logs.
   * Never a credential, and never derived from one.
   */
  readonly correlationId: string;
}

/**
 * One normalized field. The connector's mapper produces these; nothing
 * downstream sees the provider's own response shape
 * (docs/INTEGRATIONS/digilocker-integration.md §15).
 */
export interface NormalizedField {
  /** Stored as `application_data.field_code`. */
  readonly fieldKey: string;
  /** Human-readable label for the citizen, e.g. "Account holder". */
  readonly label: string;
  readonly value: string;
}

export interface NormalizedConnectorResult {
  readonly documentType: string;
  /** Provider-side identifier for the record. Synthetic; never a real document number. */
  readonly providerReference: string;
  readonly issuer: string;
  readonly issuedOn: string;
  readonly fields: readonly NormalizedField[];
}

/**
 * Why a retrieval failed, in SetuX's own vocabulary rather than the provider's
 * (government-connector.md §20).
 *
 * `retryable` is what the service uses to decide whether to offer the citizen
 * a retry — a provider outage is worth retrying, an unsupported requirement
 * never will be.
 */
export const CONNECTOR_ERROR_CODES = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  UNSUPPORTED_REQUIREMENT: 'UNSUPPORTED_REQUIREMENT',
} as const;

export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[keyof typeof CONNECTOR_ERROR_CODES];

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;

  constructor(code: ConnectorErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface GovernmentDataConnector {
  /** The `data_sources.code` this connector serves. */
  readonly sourceCode: string;
  /** True for every connector in the prototype. Surfaced to the UI so the demo never claims to be real. */
  readonly isSimulated: boolean;
  retrieve(request: ConnectorRequest): Promise<NormalizedConnectorResult>;
}
