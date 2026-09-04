/**
 * Behaviour shared by every simulated government provider.
 *
 * Phase 8 defined these inside the DigiLocker fixture file because there was
 * one provider. Phase 9 adds three more, and four private copies of the same
 * failure switch and the same reference derivation would be four places to keep
 * consistent. They live here instead, so "how a simulated provider behaves" is
 * one decision rather than one per provider.
 *
 * Nothing in this module is provider-specific. The synthetic *data* stays in
 * each connector's own fixture file, where it belongs.
 */

/**
 * Behaviour switches for a simulated provider.
 *
 * Deliberately NOT reachable from a request body. A connector reads its
 * behaviour from its own construction, so production code has no path that lets
 * a client ask a provider to fail (Phase 8 §26, Phase 9 §28).
 */
export const CONNECTOR_BEHAVIOUR = {
  NORMAL: 'NORMAL',
  ALWAYS_FAIL: 'ALWAYS_FAIL',
} as const;

export type ConnectorBehaviour = (typeof CONNECTOR_BEHAVIOUR)[keyof typeof CONNECTOR_BEHAVIOUR];

/**
 * Deterministic synthetic reference for one attempt.
 *
 * Derived from the correlation id so the same attempt always produces the same
 * reference, which is what lets tests assert on it without freezing the clock.
 * The per-provider `prefix` keeps references traceable to the system that
 * issued them — `SYNTH-EDU-…` came from the education mock and nowhere else.
 */
export const syntheticReference = (prefix: string, correlationId: string): string =>
  `SYNTH-${prefix}-${correlationId.replace(/-/gu, '').slice(0, 12).toUpperCase()}`;
