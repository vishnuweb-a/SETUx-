export { registerConnector, resetConnector, resolveConnector } from './connector.registry.js';
export {
  normalizeRecord,
  type ProviderFieldMap,
  type SimulatedRecord,
} from './connector.normalize.js';
export {
  CONNECTOR_BEHAVIOUR,
  syntheticReference,
  type ConnectorBehaviour,
} from './connector.simulation.js';
export {
  CONNECTOR_ERROR_CODES,
  ConnectorError,
  type ConnectorErrorCode,
  type ConnectorRequest,
  type GovernmentDataConnector,
  type NormalizedConnectorResult,
  type NormalizedField,
} from './connector.types.js';
export {
  FAKE_DIGILOCKER_SOURCE_CODE,
  FakeDigiLockerConnector,
} from './fake-digilocker/fake-digilocker.connector.js';
export {
  FAKE_DIGILOCKER_BEHAVIOUR,
  type FakeDigiLockerBehaviour,
} from './fake-digilocker/fake-digilocker.fixtures.js';
export {
  FAKE_IDENTITY_SOURCE_CODE,
  FakeIdentityConnector,
} from './fake-identity/fake-identity.connector.js';
export {
  FAKE_EDUCATION_SOURCE_CODE,
  FakeEducationConnector,
} from './fake-education/fake-education.connector.js';
export {
  FAKE_INCOME_SOURCE_CODE,
  FakeIncomeConnector,
} from './fake-income/fake-income.connector.js';
