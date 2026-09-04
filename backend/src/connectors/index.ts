export { registerConnector, resolveConnector } from './connector.registry.js';
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
