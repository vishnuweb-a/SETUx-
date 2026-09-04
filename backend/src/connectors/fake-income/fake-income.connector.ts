/**
 * Fake revenue department connector.
 *
 * Stands in for an income certificate system returning the declared income band
 * used for means-tested eligibility. It makes NO network call of any kind —
 * there is no HTTP client in this module, no base URL, and no credential — so
 * the prototype can demonstrate the full retrieval flow with nothing external
 * to depend on or leak to (mock-services/fake-income/README.md).
 *
 * The simulation is deterministic on purpose. A provider that failed at random
 * would make the demo unreliable and the tests flaky; failure is instead an
 * explicit construction-time behaviour (Phase 9 §28).
 *
 * The connector reports the band. It does not decide whether the citizen
 * qualifies — "the connector itself should not decide scholarship approval"
 * (government-connector.md §13); that is Phase 10's judgement.
 */
import { normalizeRecord } from '../connector.normalize.js';
import {
  CONNECTOR_BEHAVIOUR,
  syntheticReference,
  type ConnectorBehaviour,
} from '../connector.simulation.js';
import {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  type ConnectorRequest,
  type GovernmentDataConnector,
  type NormalizedConnectorResult,
} from '../connector.types.js';
import {
  FAKE_INCOME_FIELD_MAP,
  FAKE_INCOME_RECORDS,
  FAKE_INCOME_REFERENCE_PREFIX,
} from './fake-income.fixtures.js';

/** The `data_sources.code` row this connector is registered against. */
export const FAKE_INCOME_SOURCE_CODE = 'MOCK_INCOME_API';

export class FakeIncomeConnector implements GovernmentDataConnector {
  readonly sourceCode = FAKE_INCOME_SOURCE_CODE;
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
        'The simulated revenue department did not respond.',
        true,
      );
    }

    const record = FAKE_INCOME_RECORDS[request.requirementCode];
    if (!record) {
      // Not retryable: the requirement is not one this provider serves, and no
      // amount of retrying will change that.
      throw new ConnectorError(
        CONNECTOR_ERROR_CODES.UNSUPPORTED_REQUIREMENT,
        'The simulated revenue department does not hold this record.',
        false,
      );
    }

    return normalizeRecord({
      record,
      fieldMap: FAKE_INCOME_FIELD_MAP,
      providerReference: syntheticReference(FAKE_INCOME_REFERENCE_PREFIX, request.correlationId),
    });
  }
}
