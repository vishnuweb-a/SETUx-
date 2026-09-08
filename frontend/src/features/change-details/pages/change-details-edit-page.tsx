import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Button } from '@/components/ui/button';
import {
  ChangeDraftForm,
  type ChangeDraftFormField,
  type ChangeDraftFormValue,
} from '../components/change-draft-form';
import { ChangeFormShell, ChangeFormSkeleton } from '../components/change-form-shell';
import { useCitizenRecord } from '../hooks/use-citizen-records';
import { useCreateChangeDraft } from '../hooks/use-change-draft';
import {
  changeDetailsErrorMessage,
  changeDraftErrorMessage,
  isRecordNotFound,
} from '../utils/change-details-error';
import { fieldEligibility } from '../utils/field-eligibility';
import type { CitizenRecordField, FieldSelectionHandoff } from '../types/change-details.types';
import type { ChangeFieldPolicy } from '../types/change-draft.types';

/**
 * Where the citizen enters new values for the details they chose (Phase 4).
 *
 * This is the screen Phase 3 stopped short of. It takes the field selection,
 * shows each chosen detail beside what the government currently holds, and
 * collects a proposed replacement for each. Saving creates a DRAFT — a private
 * working document. Nothing is submitted to any department, and the source
 * record is not touched.
 *
 * The record is re-fetched here rather than carried in navigation state. The
 * selection travels in state because it is a transient choice; the VALUES and
 * the POLICIES must come from the server, because they are what the citizen is
 * about to make a request about and a stale copy would show them the wrong
 * "current value" to correct.
 *
 * On success the citizen is redirected to the draft's own URL, and from that
 * moment the draft id — not React state — is what identifies their work. That
 * is what makes a refresh survivable.
 */

/** Reads the selection out of router state, tolerating a state that is not ours. */
const readHandoff = (state: unknown): FieldSelectionHandoff | null => {
  if (typeof state !== 'object' || state === null) return null;

  const { recordId, selectedFieldKeys } = state as Partial<FieldSelectionHandoff>;

  if (typeof recordId !== 'string' || recordId === '') return null;
  if (!Array.isArray(selectedFieldKeys) || selectedFieldKeys.length === 0) return null;
  if (!selectedFieldKeys.every((key) => typeof key === 'string')) return null;

  return { recordId, selectedFieldKeys };
};

/**
 * The policy a field carries into the form.
 *
 * Derived from the record's own field row, which the server populated from the
 * live policy table. IMMUTABLE is not representable in the result because such
 * a field never reaches here — `selectedEditableFields` drops it, and the server
 * would refuse it again.
 */
const toFormPolicy = (field: CitizenRecordField): ChangeFieldPolicy => ({
  editability: field.editability === 'EDITABLE' ? 'EDITABLE' : 'CONDITIONALLY_EDITABLE',
  requiresEvidence: field.requiresEvidence,
  requiresReview: field.requiresReview,
  authority: field.policyAuthority,
});

/**
 * The chosen fields that may actually be corrected.
 *
 * Filtered through `fieldEligibility`, the same helper the record screen uses to
 * decide what is selectable. A selection arriving with an immutable key — a
 * hand-edited navigation state, a stale tab open across a policy change — has
 * that key dropped rather than rendered as an editable row.
 *
 * This is a UI safeguard, not the security boundary. The server refuses an
 * immutable field with `assertFieldEditable` whatever the client sends; what
 * this prevents is showing the citizen an input for a change SetuX would then
 * reject (task §11).
 */
const selectedEditableFields = (
  fields: readonly CitizenRecordField[],
  selectedKeys: readonly string[],
): readonly CitizenRecordField[] => {
  const selected = new Set(selectedKeys);

  return fields.filter(
    (field) => selected.has(field.fieldKey) && fieldEligibility(field).isSelectable,
  );
};

/**
 * One field's contribution to a request body.
 *
 * A blank reason is OMITTED rather than sent as an empty string: the schema
 * rejects `""` (it means the citizen typed only whitespace), while an absent
 * key is the correct way to say "not given".
 */
const toFieldInput = (
  fieldKey: string,
  value: ChangeDraftFormValue | undefined,
): { fieldKey: string; proposedValue: string; reason?: string } => {
  const proposedValue = value?.proposedValue ?? '';
  const reason = value?.reason ?? '';

  return reason === '' ? { fieldKey, proposedValue } : { fieldKey, proposedValue, reason };
};

export function ChangeDetailsEditPage() {
  const { recordId = '' } = useParams<{ recordId: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();
  const handoff = readHandoff(state);
  const record = useCitizenRecord(recordId);
  const createDraft = useCreateChangeDraft();

  // Reached directly, reloaded, or opened from a bookmark. The selection lives
  // in navigation state and no draft exists yet, so there is nothing to
  // restore — the citizen goes back to the record to choose again rather than
  // meeting an empty form. Once a draft HAS been created this problem
  // disappears: its own URL carries everything needed to rebuild the screen.
  if (handoff === null || handoff.recordId !== recordId) {
    return <Navigate to={`/citizen/change-details/${recordId}`} replace />;
  }

  if (record.isPending) return <ChangeFormSkeleton />;

  if (record.isError) {
    return (
      <ChangeFormShell heading="Enter new details" recordId={recordId} breadcrumbLeaf="Edit details">
        {isRecordNotFound(record.error) ? (
          <EmptyState
            title="Record not found"
            description="This record could not be found in your account. It may have been removed, or the link may be incorrect."
            action={
              <Button asChild size="sm" className="mt-2">
                <Link to="/citizen/change-details">Back to your records</Link>
              </Button>
            }
            className="bg-card"
          />
        ) : (
          <ErrorState
            title="Could not load this record"
            description={changeDetailsErrorMessage(record.error)}
            onRetry={() => void record.refetch()}
          />
        )}
      </ChangeFormShell>
    );
  }

  const detail = record.data;
  const editable = selectedEditableFields(detail.fields, handoff.selectedFieldKeys);

  // Every selected field turned out to be uncorrectable — the policy changed
  // between the record screen and this one, or the selection was tampered with.
  // Say so plainly and send them back, rather than rendering a form with no
  // rows and a save button that would fail.
  if (editable.length === 0) {
    return (
      <ChangeFormShell heading="Enter new details" recordId={recordId} breadcrumbLeaf="Edit details">
        <EmptyState
          title="No details available to change"
          description="None of the details you selected can be corrected through SetuX. Go back to the record and choose again."
          action={
            <Button asChild size="sm" className="mt-2">
              <Link to={`/citizen/change-details/${recordId}`}>Back to record</Link>
            </Button>
          }
          className="bg-card"
        />
      </ChangeFormShell>
    );
  }

  const formFields: readonly ChangeDraftFormField[] = editable.map((field) => ({
    fieldKey: field.fieldKey,
    currentValue: field.value,
    // Starts EMPTY rather than pre-filled with the current value. Pre-filling
    // would invite the citizen to save an unchanged value — which the server
    // refuses — and, worse, would make an accidental save look like a
    // deliberate confirmation of a value they never read.
    initialValue: '',
    initialReason: '',
    policy: toFormPolicy(field),
  }));

  const handleSave = (values: Readonly<Record<string, ChangeDraftFormValue>>): void => {
    createDraft.mutate(
      {
        sourceRecordId: detail.id,
        fields: formFields.map((field) => toFieldInput(field.fieldKey, values[field.fieldKey])),
      },
      {
        onSuccess: (draft) => {
          // `replace`, so Back does not return to a create form whose
          // navigation state would recreate a second draft.
          navigate(`/citizen/change-details/drafts/${draft.id}`, { replace: true });
        },
      },
    );
  };

  return (
    <ChangeFormShell heading="Enter new details" recordId={recordId} breadcrumbLeaf="Edit details">
      <ChangeDraftForm
        fields={formFields}
        submitError={createDraft.isError ? changeDraftErrorMessage(createDraft.error) : null}
        isSaving={createDraft.isPending}
        saveLabel="Save draft"
        onSave={handleSave}
        onBack={() => navigate(`/citizen/change-details/${recordId}`)}
      />
    </ChangeFormShell>
  );
}
