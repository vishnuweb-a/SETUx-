/**
 * Change & Correction Service — citizen entry flow (Phase 3).
 *
 * Read-only: this feature lists a citizen's government records, explains which
 * of their fields may be corrected, and hands a field selection to the next
 * phase. It proposes no values and writes nothing.
 */

export { ChangeDetailsRecordsPage } from './pages/change-details-records-page';
export { ChangeDetailsRecordPage } from './pages/change-details-record-page';
export { ChangeDetailsHandoffPage } from './pages/change-details-handoff-page';

export { useCitizenRecord, useCitizenRecords, citizenRecordKeys } from './hooks/use-citizen-records';
export { useFieldSelection } from './hooks/use-field-selection';

export { fieldEligibility } from './utils/field-eligibility';
export type { FieldEligibilityPresentation } from './utils/field-eligibility';

export type {
  CitizenRecordDetail,
  CitizenRecordField,
  CitizenRecordListPayload,
  CitizenRecordSummary,
  FieldEditability,
  FieldSelectionHandoff,
  RecordStatus,
  RecordType,
} from './types/change-details.types';
