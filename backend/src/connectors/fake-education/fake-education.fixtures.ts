/**
 * Synthetic records the fake education department returns.
 *
 * EVERY value here is invented and must stay that way. Nothing in this file may
 * resemble a real board, university, roll number or student (Phase 9 §9). The
 * identifier is prefixed `SYNTH-`, and the issuer is named "(Simulated)", so a
 * value which leaks into a screenshot or a log is self-evidently a fixture.
 *
 * Keyed by `service_requirements.requirement_code`: the set of records this
 * provider can return is bounded by what the database actually asks for, not by
 * what a client requests.
 */
import type { ProviderFieldMap, SimulatedRecord } from '../connector.normalize.js';

/**
 * The requirement codes this provider serves.
 *
 * MOCK_EDUCATION_API is named by exactly one requirement code —
 * `EDUCATION_RECORD` — although six seeded requirements use it, under service-
 * specific names ("Class 12 Result", "Enrolment Record", "Postgraduate
 * Record"). The provider answers the code; the citizen sees the service's own
 * label for it, which `service_requirements.name` already supplies.
 *
 * A requirement outside this map is refused rather than answered with a
 * plausible-looking invention.
 */
export const FAKE_EDUCATION_RECORDS: Readonly<Record<string, SimulatedRecord>> = {
  EDUCATION_RECORD: {
    documentType: 'EDUCATION_RECORD',
    issuer: 'Demo State Education Board (Simulated)',
    issuedOn: '2026-05-28',
    attributes: {
      enrol_no: 'SYNTH-EDU-2026-004417',
      student_name: 'Demo Citizen',
      inst_name: 'Demo Institute of Technology (Simulated)',
      programme: 'B.Tech, Computer Science',
      exam_board: 'Demo State Education Board',
      result_year: '2026',
      // A percentage, not a raw mark sheet. The scholarship's eligibility rule
      // needs an aggregate; the individual subject marks are more personal data
      // than the demonstration requires.
      aggregate_pct: '82.4',
      enrol_status: 'ENROLLED',
    },
  },
};

/**
 * Provider field name → the label and key SetuX stores.
 *
 * This is the normalization boundary: `aggregate_pct` is the board's word for
 * it, `educationAggregatePercentage` is SetuX's. Renaming a provider field must
 * not ripple into the database or the UI.
 */
export const FAKE_EDUCATION_FIELD_MAP: ProviderFieldMap = {
  enrol_no: { fieldKey: 'educationEnrolmentNumber', label: 'Enrolment number' },
  student_name: { fieldKey: 'educationStudentName', label: 'Student name' },
  inst_name: { fieldKey: 'educationInstitution', label: 'Institution' },
  programme: { fieldKey: 'educationProgramme', label: 'Programme' },
  exam_board: { fieldKey: 'educationBoard', label: 'Board or university' },
  result_year: { fieldKey: 'educationResultYear', label: 'Result year' },
  aggregate_pct: { fieldKey: 'educationAggregatePercentage', label: 'Aggregate' },
  enrol_status: { fieldKey: 'educationEnrolmentStatus', label: 'Enrolment status' },
};

/** Prefix for this provider's synthetic attempt references. */
export const FAKE_EDUCATION_REFERENCE_PREFIX = 'EDU';
