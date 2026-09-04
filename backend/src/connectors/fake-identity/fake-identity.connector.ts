/**
 * Fake identity registry connector.
 *
 * Stands in for a national identity registry confirming that a citizen's
 * identity attributes match an authoritative record. It makes NO network call
 * of any kind — there is no HTTP client in this module, no base URL, and no
 * credential — so the prototype can demonstrate the full retrieval flow with
 * nothing external to depend on or leak to
 * (mock-services/fake-identity/README.md).
 *
 * The simulation is deterministic on purpose. A provider that failed at random
 * would make the demo unreliable and the tests flaky; failure is instead an
 * explicit construction-time behaviour (Phase 9 §28).
 *
 * This connector CONFIRMS a match against the registry; it does not verify the
 * application. `identityMatch` is provider-reported data like any other
 * retrieved field, and it is stored unverified. Deciding what a match means for
 * the scholarship belongs to Phase 10 (government-connector.md §6).
 */
import { normalizeRecord } from '../connector.normalize.js';
import { CONNECTOR_BEHAVIOUR, syntheticReference, type ConnectorBehaviour } from '../connector.simulation.js';
import {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  type ConnectorRequest,
  type GovernmentDataConnector,
  type NormalizedConnectorResult,
} from '../connector.types.js';
import {
  FAKE_IDENTITY_FIELD_MAP,
  FAKE_IDENTITY_RECORDS,
  FAKE_IDENTITY_REFERENCE_PREFIX,
} from './fake-identity.fixtures.js';

/** The `data_sources.code` row this connector is registered against. */
export const FAKE_IDENTITY_SOURCE_CODE = 'MOCK_IDENTITY_API';

export class FakeIdentityConnector implements GovernmentDataConnector {
  readonly sourceCode = FAKE_IDENTITY_SOURCE_CODE;
  readonly isSimulated = true;

  /**
   * @param behaviour How the simulated provider responds. Defaults to NORMAL.
   *   `ALWAYS_FAIL` exists so tests and a scripted demo can exercise the failure
   *   path; it is set when the connector is constructed, never by a request.
   */
  constructor(private readonly behaviour: ConnectorBehaviour = CONNECTOR_BEHAVIOUR.NORMAL) {}

  /**
   * `async` although nothing here awaits: the interface is asynchronous because
   * a real provider is, and this simulation must be substitutable for one.
   */
  async retrieve(request: ConnectorRequest): Promise<NormalizedConnectorResult> {
    if (this.behaviour === CONNECTOR_BEHAVIOUR.ALWAYS_FAIL) {
      throw new ConnectorError(
        CONNECTOR_ERROR_CODES.PROVIDER_UNAVAILABLE,
        'The simulated identity registry did not respond.',
        true,
      );
    }

    const record = FAKE_IDENTITY_RECORDS[request.requirementCode];
    if (!record) {
      // Not retryable: the requirement is not one this provider serves, and no
      // amount of retrying will change that.
      throw new ConnectorError(
        CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
        'The simulated identity registry does not hold this record.',
        false,
      );
    }

    return normalizeRecord({
      record,
      fieldMap: FAKE_IDENTITY_FIELD_MAP,
      providerReference: syntheticReference(FAKE_IDENTITY_REFERENCE_PREFIX, request.correlationId),
    });
  }
}
