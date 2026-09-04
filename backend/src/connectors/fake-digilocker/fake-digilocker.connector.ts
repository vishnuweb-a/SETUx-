/**
 * Fake DigiLocker connector.
 *
 * Stands in for a DigiLocker-style document repository. It makes NO network
 * call of any kind — there is no HTTP client in this module, no base URL, and
 * no credential — so the prototype can demonstrate the full retrieval flow with
 * nothing external to depend on or leak to (Phase 8 §12,
 * mock-services/fake-digilocker/README.md).
 *
 * The simulation is deterministic on purpose. A provider that failed at random
 * would make the demo unreliable and the tests flaky; failure is instead an
 * explicit construction-time behaviour (§26).
 */
import {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  type ConnectorRequest,
  type GovernmentDataConnector,
  type NormalizedConnectorResult,
  type NormalizedField,
} from '../connector.types.js';
import {
  FAKE_DIGILOCKER_BEHAVIOUR,
  FAKE_DIGILOCKER_DOCUMENTS,
  FAKE_DIGILOCKER_FIELD_MAP,
  syntheticReference,
  type FakeDigiLockerBehaviour,
  type FakeDigiLockerDocument,
} from './fake-digilocker.fixtures.js';

/** The `data_sources.code` row this connector is registered against. */
export const FAKE_DIGILOCKER_SOURCE_CODE = 'DIGILOCKER_MOCK';

/**
 * Provider response → SetuX domain model.
 *
 * An attribute with no mapping is dropped rather than passed through under its
 * provider name. Letting unmapped fields through is how a provider's vocabulary
 * escapes into the database, and it would also mean a provider could introduce
 * a field SetuX never agreed to store.
 */
const normalize = (
  document: FakeDigiLockerDocument,
  providerReference: string,
): NormalizedConnectorResult => {
  const fields: NormalizedField[] = Object.entries(document.attributes).flatMap(
    ([attribute, value]) => {
      const mapping = FAKE_DIGILOCKER_FIELD_MAP[attribute];
      return mapping ? [{ fieldKey: mapping.fieldKey, label: mapping.label, value }] : [];
    },
  );

  return {
    documentType: document.documentType,
    providerReference,
    issuer: document.issuer,
    issuedOn: document.issuedOn,
    fields,
  };
};

export class FakeDigiLockerConnector implements GovernmentDataConnector {
  readonly sourceCode = FAKE_DIGILOCKER_SOURCE_CODE;
  readonly isSimulated = true;

  /**
   * @param behaviour How the simulated provider responds. Defaults to NORMAL.
   *   `ALWAYS_FAIL` exists so tests and a scripted demo can exercise the failure
   *   path; it is set when the connector is constructed, never by a request.
   */
  constructor(private readonly behaviour: FakeDigiLockerBehaviour = FAKE_DIGILOCKER_BEHAVIOUR.NORMAL) {}

  /**
   * `async` although nothing here awaits: the interface is asynchronous because
   * a real provider is, and this simulation must be substitutable for one.
   */
  async retrieve(request: ConnectorRequest): Promise<NormalizedConnectorResult> {
    if (this.behaviour === FAKE_DIGILOCKER_BEHAVIOUR.ALWAYS_FAIL) {
      throw new ConnectorError(
        CONNECTOR_ERROR_CODES.PROVIDER_UNAVAILABLE,
        'The simulated DigiLocker service did not respond.',
        true,
      );
    }

    const document = FAKE_DIGILOCKER_DOCUMENTS[request.requirementCode];
    if (!document) {
      // Not retryable: the requirement is not one this provider serves, and no
      // amount of retrying will change that.
      throw new ConnectorError(
        CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
        'The simulated DigiLocker service does not hold this document.',
        false,
      );
    }

    return normalize(document, syntheticReference(request.correlationId));
  }
}
