/**
 * Change & Correction Service — citizen entry and draft flow (Phases 3–4).
 *
 * Phase 3 lists a citizen's government records, explains which of their fields
 * may be corrected, and collects a field selection. Phase 4 turns that
 * selection into an editable form and saves a DRAFT correction request.
 *
 * The one thing this feature never does: change a government record. Its only
 * writes target `/change-requests`, which store what the citizen has ASKED for
 * beside a server-taken snapshot of what the source held when they asked. The
 * source's own values are read and never written.
 */

export { ChangeDetailsRecordsPage } from './pages/change-details-records-page';
export { ChangeDetailsRecordPage } from './pages/change-details-record-page';
export { ChangeDetailsEditPage } from './pages/change-details-edit-page';
export { ChangeDraftPage } from './pages/change-draft-page';

export { useCitizenRecord, useCitizenRecords, citizenRecordKeys } from './hooks/use-citizen-records';
export { useFieldSelection } from './hooks/use-field-selection';
export {
  changeDraftKeys,
  useChangeDraft,
  useCreateChangeDraft,
  useUpdateChangeDraft,
} from './hooks/use-change-draft';

export { fieldEligibility } from './utils/field-eligibility';
export type { FieldEligibilityPresentation } from './utils/field-eligibility';
export { validateProposedValue, validateChangeDraftFields } from './utils/change-draft-validation';

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

export type {
  ChangeDraftDetail,
  ChangeDraftField,
  ChangeDraftFieldInput,
  ChangeFieldPolicy,
  ChangeRequestStatus,
  CreateChangeDraftInput,
  UpdateChangeDraftInput,
} from './types/change-draft.types';
