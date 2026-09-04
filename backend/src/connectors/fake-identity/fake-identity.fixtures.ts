/**
 * Synthetic records the fake identity registry returns.
 *
 * EVERY value here is invented and must stay that way. Nothing in this file may
 * resemble a real Aadhaar or PAN number, a real registry, or a real person
 * (Phase 9 §9). The identifier is prefixed `SYNTH-`, the issuer is named
 * "(Simulated)", and the reference number is deliberately shaped UNLIKE a real
 * identity number so that a value which leaks into a screenshot or a log is
 * self-evidently a fixture.
 *
 * Keyed by `service_requirements.requirement_code`: the set of records this
 * provider can return is bounded by what the database actually asks for, not by
 * what a client requests.
 */
import type { ProviderFieldMap, SimulatedRecord } from '../connector.normalize.js';

/**
 * The requirement codes this provider serves.
 *
 * MOCK_IDENTITY_API is named by exactly one seeded requirement — `IDENTITY`,
 * used by all seven scholarship services (supabase/seed/seed.sql). A
 * requirement outside this map is refused rather than answered with a
 * plausible-looking invention.
 */
export const FAKE_IDENTITY_RECORDS: Readonly<Record<string, SimulatedRecord>> = {
  IDENTITY: {
    documentType: 'IDENTITY_CONFIRMATION',
    issuer: 'Demo Identity Registry (Simulated)',
    issuedOn: '2026-02-10',
    attributes: {
      // A synthetic registry handle, NOT an identity number. Real identity
      // numbers are never returned by this simulation and would never be stored
      // by SetuX in any case.
      reg_ref: 'SYNTH-IDR-2026-0117',
      holder_name: 'Demo Citizen',
      // Year only. A full date of birth is more personal data than an
      // identity confirmation needs to demonstrate.
      birth_year: '2004',
      match_result: 'MATCHED',
      reg_status: 'ACTIVE',
    },
  },
};

/**
 * Provider field name → the label and key SetuX stores.
 *
 * This is the normalization boundary: `match_result` is the registry's word for
 * it, `identityMatch` is SetuX's. Renaming a provider field must not ripple
 * into the database or the UI.
 */
export const FAKE_IDENTITY_FIELD_MAP: ProviderFieldMap = {
  reg_ref: { fieldKey: 'identityRegistryReference', label: 'Registry reference' },
  holder_name: { fieldKey: 'identityHolderName', label: 'Name on record' },
  birth_year: { fieldKey: 'identityBirthYear', label: 'Year of birth' },
  match_result: { fieldKey: 'identityMatch', label: 'Identity match' },
  reg_status: { fieldKey: 'identityRecordStatus', label: 'Record status' },
};

/** Prefix for this provider's synthetic attempt references. */
export const FAKE_IDENTITY_REFERENCE_PREFIX = 'ID';
