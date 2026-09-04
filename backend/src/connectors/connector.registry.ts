/**
 * Resolves a `data_sources.code` to the connector that serves it
 * (government-connector.md §16).
 *
 * The lookup key is a database value, so which connector runs is decided by
 * configuration the server owns. A client names a requirement; the server
 * derives the source from that requirement and the connector from the source.
 * At no point does a request choose its own provider (Phase 8 §7, §23;
 * Phase 9 §7).
 *
 * Phase 8 registered one connector and left the other three seeded sources
 * unserved. Phase 9 registers them here — and nowhere else. The retrieval
 * service was not touched to add them, which is precisely the property the
 * connector boundary exists to provide: adding a government system is a
 * registration, not a change to the orchestration.
 */
import type { GovernmentDataConnector } from './connector.types.js';
import { FakeDigiLockerConnector } from './fake-digilocker/fake-digilocker.connector.js';
import { FakeEducationConnector } from './fake-education/fake-education.connector.js';
import { FakeIdentityConnector } from './fake-identity/fake-identity.connector.js';
import { FakeIncomeConnector } from './fake-income/fake-income.connector.js';

/**
 * Every connector SetuX can run, keyed by the source code it serves.
 *
 * Built from each connector's own `sourceCode` rather than from a hand-written
 * key, so a connector cannot be registered under a source it does not claim —
 * a mismatch that would let one provider answer for another (Phase 9 §25).
 */
const defaultConnectors: readonly GovernmentDataConnector[] = [
  new FakeDigiLockerConnector(),
  new FakeIdentityConnector(),
  new FakeEducationConnector(),
  new FakeIncomeConnector(),
];

const registry = new Map<string, GovernmentDataConnector>(
  defaultConnectors.map((connector) => [connector.sourceCode, connector]),
);

/**
 * Returns the connector for a source code, or `null` when no connector is
 * registered for it.
 *
 * Null remains the honest answer for a source SetuX does not serve — including
 * a forged or misspelled code, which resolves to nothing rather than to a
 * default provider. The service turns it into "not available" rather than
 * pretending a retrieval was attempted.
 */
export const resolveConnector = (sourceCode: string): GovernmentDataConnector | null =>
  registry.get(sourceCode) ?? null;

/** Test seam: lets a suite substitute a failing provider without a client-visible flag. */
export const registerConnector = (connector: GovernmentDataConnector): void => {
  registry.set(connector.sourceCode, connector);
};

/**
 * Restores the default registration for one source.
 *
 * A suite that substitutes a failing provider must be able to put the real one
 * back, or it leaks that failure into every test that runs after it.
 */
export const resetConnector = (sourceCode: string): void => {
  const original = defaultConnectors.find((connector) => connector.sourceCode === sourceCode);
  if (original) registry.set(sourceCode, original);
};
