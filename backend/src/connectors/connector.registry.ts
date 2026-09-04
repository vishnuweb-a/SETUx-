/**
 * Resolves a `data_sources.code` to the connector that serves it
 * (government-connector.md §16).
 *
 * The lookup key is a database value, so which connector runs is decided by
 * configuration the server owns. A client names a requirement; the server
 * derives the source from that requirement and the connector from the source.
 * At no point does a request choose its own provider (Phase 8 §7, §23).
 *
 * Phase 8 registers exactly one connector. Phase 9 adds the identity, education
 * and income connectors to this same map without touching the retrieval
 * service — which is the property the boundary exists to provide.
 */
import type { GovernmentDataConnector } from './connector.types.js';
import {
  FAKE_DIGILOCKER_SOURCE_CODE,
  FakeDigiLockerConnector,
} from './fake-digilocker/fake-digilocker.connector.js';

const registry = new Map<string, GovernmentDataConnector>([
  [FAKE_DIGILOCKER_SOURCE_CODE, new FakeDigiLockerConnector()],
]);

/**
 * Returns the connector for a source code, or `null` when no connector is
 * registered for it.
 *
 * Null is the honest answer for the four seeded sources Phase 9 has not built
 * yet. The service turns it into "not available in this phase" rather than
 * pretending a retrieval was attempted.
 */
export const resolveConnector = (sourceCode: string): GovernmentDataConnector | null =>
  registry.get(sourceCode) ?? null;

/** Test seam: lets a suite substitute a failing provider without a client-visible flag. */
export const registerConnector = (connector: GovernmentDataConnector): void => {
  registry.set(connector.sourceCode, connector);
};
