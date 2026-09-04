/**
 * Synthetic records the fake revenue department returns.
 *
 * EVERY value here is invented and must stay that way. Nothing in this file may
 * resemble a real PAN, a real income tax record, or a real household (Phase 9
 * §9). The identifier is prefixed `SYNTH-`, and the issuer is named
 * "(Simulated)", so a value which leaks into a screenshot or a log is
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
 * MOCK_INCOME_API is named by exactly one requirement code — `INCOME_RECORD` —
 * used by five seeded services (supabase/seed/seed.sql). A requirement outside
 * this map is refused rather than answered with a plausible-looking invention.
 */
export const FAKE_INCOME_RECORDS: Readonly<Record<string, SimulatedRecord>> = {
  INCOME_RECORD: {
    documentType: 'INCOME_CERTIFICATE',
    issuer: 'Demo Revenue Department (Simulated)',
    issuedOn: '2026-04-05',
    attributes: {
      cert_no: 'SYNTH-INC-2026-008812',
      holder_name: 'Demo Citizen',
      assess_year: '2025-2026',
      // A band rather than an exact figure. A means test needs to know which
      // side of the threshold a household falls, not its precise income, and
      // the band is the less sensitive of the two (government-connector.md §13).
      income_band: 'BELOW_THRESHOLD',
      issuing_office: 'Demo Tehsil Revenue Office',
      valid_until: '2027-03-31',
    },
  },
};

/**
 * Provider field name → the label and key SetuX stores.
 *
 * This is the normalization boundary: `income_band` is the department's word
 * for it, `incomeBand` is SetuX's. Renaming a provider field must not ripple
 * into the database or the UI.
 */
export const FAKE_INCOME_FIELD_MAP: ProviderFieldMap = {
  cert_no: { fieldKey: 'incomeCertificateNumber', label: 'Certificate number' },
  holder_name: { fieldKey: 'incomeCertificateHolder', label: 'Issued to' },
  assess_year: { fieldKey: 'incomeAssessmentYear', label: 'Assessment year' },
  income_band: { fieldKey: 'incomeBand', label: 'Income band' },
  issuing_office: { fieldKey: 'incomeIssuingOffice', label: 'Issuing office' },
  valid_until: { fieldKey: 'incomeValidUntil', label: 'Valid until' },
};

/** Prefix for this provider's synthetic attempt references. */
export const FAKE_INCOME_REFERENCE_PREFIX = 'INC';
