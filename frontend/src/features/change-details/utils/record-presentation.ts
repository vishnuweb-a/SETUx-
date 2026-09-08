/**
 * Human-readable names for the vocabulary the API speaks in codes.
 *
 * Centralised deliberately. Labels scattered through JSX drift apart — the same
 * field ends up "Mobile" on one screen and "Mobile Number" on the next — and a
 * citizen reading a legal record notices. One table, imported by every screen
 * that renders a record.
 *
 * These are presentation only. Nothing here decides what may be changed; that
 * is the server's field policy, rendered by `field-eligibility.ts`.
 */

import type {
  CitizenRecordField,
  RecordAuthority,
  RecordSource,
  RecordStatus,
  RecordType,
} from '../types/change-details.types';

const RECORD_TYPE_LABELS: Readonly<Record<RecordType, string>> = {
  IDENTITY_RECORD: 'Identity Record',
  INCOME_RECORD: 'Income Certificate',
  EDUCATION_RECORD: 'Education Record',
  COMMUNITY_RECORD: 'Community Certificate',
  BANK_DETAILS: 'Bank Details',
};

/**
 * What each record is *for*, in the citizen's terms.
 *
 * The record chooser shows five cards that otherwise differ only by title; a
 * line saying what each one governs is what makes the choice obvious.
 */
const RECORD_TYPE_DESCRIPTIONS: Readonly<Record<RecordType, string>> = {
  IDENTITY_RECORD: 'Your name, date of birth, address and contact details.',
  INCOME_RECORD: 'Your income band and the certificate issued against it.',
  EDUCATION_RECORD: 'Your enrolment, institution and academic results.',
  COMMUNITY_RECORD: 'Your community category certificate.',
  BANK_DETAILS: 'The account SetuX would credit a scholarship to.',
};

/**
 * Field labels, keyed by the normalised SetuX field key.
 *
 * The keys are the connectors' normalised vocabulary (`identityHolderName`),
 * not a provider's own column names — the same keys Phase 1 policies are
 * written against.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  identityHolderName: 'Full Name',
  identityBirthYear: 'Birth Year',
  identityMobile: 'Mobile Number',
  identityAddress: 'Address',
  identityRegistryReference: 'Identity Reference',
  identityRecordStatus: 'Record Status',

  incomeCertificateHolder: 'Certificate Holder',
  incomeAddress: 'Address',
  incomeBand: 'Income Band',
  incomeCertificateNumber: 'Certificate Number',
  incomeIssuingOffice: 'Issuing Office',
  incomeAssessmentYear: 'Assessment Year',
  incomeValidUntil: 'Valid Until',

  educationStudentName: 'Student Name',
  educationEnrolmentNumber: 'Enrollment Number',
  educationInstitution: 'Institution',
  educationAggregatePercentage: 'Aggregate Percentage',
  educationBoard: 'Board / University',
  educationResultYear: 'Result Year',
  educationEnrolmentStatus: 'Enrollment Status',

  communityCertificateHolder: 'Certificate Holder',
  communityCategory: 'Community Category',
  communityCertificateNumber: 'Certificate Number',
  communityIssuingOffice: 'Issuing Office',

  bankAccountHolder: 'Account Holder',
  bankAccountMasked: 'Account Number',
  bankBranchCode: 'Branch Code',
  bankBranchName: 'Branch Name',
  bankAccountStatus: 'Account Status',
};

const RECORD_STATUS_LABELS: Readonly<Record<RecordStatus, string>> = {
  ACTIVE: 'Up to date',
  STALE: 'May be out of date',
  UNAVAILABLE: 'Source unavailable',
};

/** What a record status means, so the badge is never the only explanation. */
const RECORD_STATUS_DESCRIPTIONS: Readonly<Record<RecordStatus, string>> = {
  ACTIVE: 'SetuX last read this record successfully from its source.',
  STALE: 'This copy may be older than the source. Values shown are the last SetuX read.',
  UNAVAILABLE: 'SetuX could not reach the source system. Corrections may not be accepted right now.',
};

export const recordTypeLabel = (recordType: RecordType): string =>
  RECORD_TYPE_LABELS[recordType] ?? recordType;

export const recordTypeDescription = (recordType: RecordType): string =>
  RECORD_TYPE_DESCRIPTIONS[recordType] ?? '';

export const recordStatusLabel = (status: RecordStatus): string =>
  RECORD_STATUS_LABELS[status] ?? status;

export const recordStatusDescription = (status: RecordStatus): string =>
  RECORD_STATUS_DESCRIPTIONS[status] ?? '';

/**
 * The label for a field key.
 *
 * An unmapped key falls back to the key itself rather than being hidden. A
 * record the citizen cannot fully see is worse than one showing a technical
 * name, and a missing label is a seed gap to notice, not to conceal.
 */
export const fieldLabel = (fieldKey: string): string => FIELD_LABELS[fieldKey] ?? fieldKey;

/** True when the label had to fall back to the raw key. */
export const hasFieldLabel = (fieldKey: string): boolean => fieldKey in FIELD_LABELS;

/**
 * A field value rendered for display.
 *
 * The API types `value` as `unknown` because the source decides its type, so
 * every value passes through here rather than into JSX directly. An absent
 * value becomes an em dash — a blank cell reads as a rendering bug.
 */
export const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

/**
 * How a record names its provider to the citizen.
 *
 * Synthetic sources are marked as such wherever they appear. A prototype that
 * lets a demo record read as a real government holding is the one presentation
 * failure with consequences outside the screen.
 *
 * Most seeded source names already carry their own marker — "(Mock)",
 * "(Simulated)" — so the suffix is added only when one is absent. Appending
 * unconditionally produced "Demo Public Bank (Simulated) (Simulated)", which
 * reads as a rendering fault and undermines the very claim it is making.
 */
const SIMULATION_MARKER = /\((?:mock|simulated|demo|test|sample)\)/i;

export const sourceLabel = (source: RecordSource, isSimulated: boolean): string =>
  isSimulated && !SIMULATION_MARKER.test(source.name)
    ? `${source.name} (Simulated)`
    : source.name;

/**
 * Who to approach about a record, in words.
 *
 * `null` authority is the bank: a provider with no officer queue. It gets an
 * honest sentence rather than an invented department.
 */
export const authorityLabel = (authority: RecordAuthority | null): string =>
  authority?.name ?? 'Handled directly by the provider';

/** A date as the citizen-facing screens format dates elsewhere in SetuX. */
export const formatDate = (value: string | null): string =>
  value === null
    ? 'Never'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));

/** Fields the citizen may select, in the order the record renders them. */
export const selectableFields = (
  fields: readonly CitizenRecordField[],
): readonly CitizenRecordField[] => fields.filter((field) => field.changeable);
