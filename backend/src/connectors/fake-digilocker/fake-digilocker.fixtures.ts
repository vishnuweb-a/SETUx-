/**
 * Synthetic documents the fake DigiLocker returns.
 *
 * EVERY value here is invented and must stay that way. Nothing in this file may
 * resemble a real Aadhaar, PAN or passport number, a real institution, or a real
 * person (Phase 8 §13, mock-services/README.md). The identifiers are prefixed
 * `SYNTH-` and the issuers are named "(Simulated)" so that a value which leaks
 * into a screenshot or a log is self-evidently a fixture.
 *
 * Keyed by `service_requirements.requirement_code`: the set of documents this
 * provider can return is bounded by what the database actually asks for, not by
 * what a client requests.
 */
import type { NormalizedConnectorResult } from '../connector.types.js';

/** Document shapes as the simulated provider itself would express them. */
export interface FakeDigiLockerDocument {
  readonly documentType: string;
  readonly issuer: string;
  readonly issuedOn: string;
  /** Provider-native field names, deliberately unlike SetuX's own. The mapper bridges them. */
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * The requirement codes this provider serves.
 *
 * DIGILOCKER_MOCK is named by exactly two seeded requirements — `BANK_DETAILS`
 * and `COMMUNITY_RECORD` (supabase/seed/seed.sql). A requirement outside this
 * map is refused rather than answered with a plausible-looking invention.
 */
export const FAKE_DIGILOCKER_DOCUMENTS: Readonly<Record<string, FakeDigiLockerDocument>> = {
  BANK_DETAILS: {
    documentType: 'BANK_ACCOUNT_PROOF',
    issuer: 'Demo Public Bank (Simulated)',
    issuedOn: '2026-01-15',
    attributes: {
      // Masked to its last four digits, which is all a disbursement check needs.
      acct_no_masked: 'XXXXXX4409',
      acct_holder: 'Demo Citizen',
      branch_ifsc: 'DEMO0001234',
      branch_name: 'Demo Branch, Sector 7',
      acct_status: 'ACTIVE',
    },
  },
  COMMUNITY_RECORD: {
    documentType: 'COMMUNITY_CERTIFICATE',
    issuer: 'Demo District Authority (Simulated)',
    issuedOn: '2025-11-02',
    attributes: {
      cert_no: 'SYNTH-COM-2025-0042',
      holder_name: 'Demo Citizen',
      community_class: 'Demo Category B',
      issuing_office: 'Demo Tehsil Office',
      valid_until: '2030-11-01',
    },
  },
};

/**
 * Provider field name → the label and key SetuX stores.
 *
 * This is the normalization boundary: `acct_no_masked` is the provider's word
 * for it, `bankAccountMasked` is SetuX's. Renaming a provider field must not
 * ripple into the database or the UI (digilocker-integration.md §15).
 */
export const FAKE_DIGILOCKER_FIELD_MAP: Readonly<
  Record<string, { readonly fieldKey: string; readonly label: string }>
> = {
  acct_no_masked: { fieldKey: 'bankAccountMasked', label: 'Account number' },
  acct_holder: { fieldKey: 'bankAccountHolder', label: 'Account holder' },
  branch_ifsc: { fieldKey: 'bankBranchCode', label: 'Branch code' },
  branch_name: { fieldKey: 'bankBranchName', label: 'Branch' },
  acct_status: { fieldKey: 'bankAccountStatus', label: 'Account status' },
  cert_no: { fieldKey: 'communityCertificateNumber', label: 'Certificate number' },
  holder_name: { fieldKey: 'communityCertificateHolder', label: 'Issued to' },
  community_class: { fieldKey: 'communityCategory', label: 'Category' },
  issuing_office: { fieldKey: 'communityIssuingOffice', label: 'Issuing office' },
  valid_until: { fieldKey: 'communityValidUntil', label: 'Valid until' },
};

/**
 * Deterministic synthetic reference for one attempt.
 *
 * Derived from the correlation id so the same attempt always produces the same
 * reference, which is what lets tests assert on it without freezing the clock.
 */
export const syntheticReference = (correlationId: string): string =>
  `SYNTH-DL-${correlationId.replace(/-/gu, '').slice(0, 12).toUpperCase()}`;

/**
 * Behaviour switches for the simulated provider.
 *
 * Deliberately NOT reachable from a request body. The connector reads these
 * from its own construction, so production code has no path that lets a client
 * ask the provider to fail (Phase 8 §26).
 */
export const FAKE_DIGILOCKER_BEHAVIOUR = {
  NORMAL: 'NORMAL',
  ALWAYS_FAIL: 'ALWAYS_FAIL',
} as const;

export type FakeDigiLockerBehaviour =
  (typeof FAKE_DIGILOCKER_BEHAVIOUR)[keyof typeof FAKE_DIGILOCKER_BEHAVIOUR];

export const NORMALIZED_RESULT_KEYS: readonly (keyof NormalizedConnectorResult)[] = [
  'documentType',
  'providerReference',
  'issuer',
  'issuedOn',
  'fields',
];
