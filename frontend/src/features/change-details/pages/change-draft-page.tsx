import { CircleCheck, Info } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Button } from '@/components/ui/button';
import {
  ChangeDraftForm,
  type ChangeDraftFormField,
  type ChangeDraftFormValue,
} from '../components/change-draft-form';
import { proposedValueText } from '../utils/change-draft-presentation';
import { ChangeFormShell, ChangeFormSkeleton } from '../components/change-form-shell';
import { useChangeDraft, useUpdateChangeDraft } from '../hooks/use-change-draft';
import { changeDraftErrorMessage, isChangeDraftNotFound } from '../utils/change-details-error';
import type { ChangeDraftDetail } from '../types/change-draft.types';

/**
 * A saved draft correction request (Phase 4).
 *
 * This screen is what makes the work durable. Its URL contains the draft's own
 * id, and everything on it is read from the server — so a refresh, a closed
 * tab, or a link opened tomorrow rebuilds the same form with the same values.
 * Nothing depends on navigation state, which is precisely what the create
 * screen could not promise (task §12).
 *
 * Both values are shown for every field: what the source held when the request
 * was made, and what the citizen asked for. The first is read-only for the life
 * of the draft — revising a request changes what is being asked for, never what
 * was true when it was asked.
 *
 * WHERE PHASE 4 STOPS. A saved draft is the end of this phase. The dependency
 * engine, the impact preview, target selection and consent are the next
 * stage's work and none of them exists; the screen says so rather than
 * offering a "Continue" that would lead nowhere.
 */
export function ChangeDraftPage() {
  const { changeRequestId = '' } = useParams<{ changeRequestId: string }>();
  const draft = useChangeDraft(changeRequestId);
  const updateDraft = useUpdateChangeDraft(changeRequestId);
  const navigate = useNavigate();

  if (draft.isPending) return <ChangeFormSkeleton />;

  if (draft.isError) {
    return (
      <ChangeFormShell heading="Your correction request" recordId={null} breadcrumbLeaf="Request">
        {isChangeDraftNotFound(draft.error) ? (
          // A draft belonging to another citizen produces this same state as one
          // that never existed. The wording must not suggest otherwise.
          <EmptyState
            title="Request not found"
            description="This correction request could not be found in your account. It may have been removed, or the link may be incorrect."
            action={
              <Button asChild size="sm" className="mt-2">
                <Link to="/citizen/change-details">Back to your records</Link>
              </Button>
            }
            className="bg-card"
          />
        ) : (
          <ErrorState
            title="Could not load this request"
            description={changeDraftErrorMessage(draft.error)}
            onRetry={() => void draft.refetch()}
          />
        )}
      </ChangeFormShell>
    );
  }

  const detail = draft.data;

  // A draft with no fields cannot be produced by this flow — the API refuses an
  // empty field list on create and on revise. It is handled anyway rather than
  // rendering a form with no rows, because a screen that assumes its data is
  // non-empty fails badly on the one occasion it is wrong.
  if (detail.fields.length === 0) {
    return (
      <ChangeFormShell
        heading="Your correction request"
        recordId={detail.sourceRecordId}
        breadcrumbLeaf="Request"
      >
        <EmptyState
          title="This request has no details"
          description="No details are attached to this correction request. Go back to the record and choose what you want corrected."
          action={
            <Button asChild size="sm" className="mt-2">
              <Link to={`/citizen/change-details/${detail.sourceRecordId}`}>Back to record</Link>
            </Button>
          }
          className="bg-card"
        />
      </ChangeFormShell>
    );
  }

  const formFields: readonly ChangeDraftFormField[] = detail.fields.map((field) => ({
    fieldKey: field.fieldKey,
    // The SNAPSHOT, not the source's value today. This is what the citizen was
    // looking at when they made the request, and it is what the request is
    // about.
    currentValue: field.oldValue,
    initialValue: proposedValueText(field.proposedValue),
    initialReason: field.reason ?? '',
    policy: field.policy,
  }));

  const handleSave = (values: Readonly<Record<string, ChangeDraftFormValue>>): void => {
    updateDraft.mutate(
      formFields.map((field) => {
        const value = values[field.fieldKey];
        const reason = value?.reason ?? '';
        const base = { fieldKey: field.fieldKey, proposedValue: value?.proposedValue ?? '' };

        // A blank reason is omitted, not sent as `""` — the schema rejects the
        // empty string, and an absent key is how "not given" is expressed.
        return reason === '' ? base : { ...base, reason };
      }),
    );
  };

  return (
    <ChangeFormShell
      heading="Your correction request"
      recordId={detail.sourceRecordId}
      breadcrumbLeaf="Request"
    >
      <DraftSummary detail={detail} />

      <ChangeDraftForm
        // Remounts when the server's copy changes, so the inputs re-seed from
        // the saved draft rather than keeping local state that no longer
        // matches what was stored.
        key={detail.updatedAt}
        fields={formFields}
        submitError={updateDraft.isError ? changeDraftErrorMessage(updateDraft.error) : null}
        isSaving={updateDraft.isPending}
        saveLabel="Save changes"
        onSave={handleSave}
        onBack={() => navigate(`/citizen/change-details/${detail.sourceRecordId}`)}
        footer={<PhaseBoundaryNotice />}
      />
    </ChangeFormShell>
  );
}

/** What this draft is, and the assurance that saving it changed nothing official. */
function DraftSummary({ detail }: { readonly detail: ChangeDraftDetail }) {
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <AlertTitle>Draft saved</AlertTitle>
      <AlertDescription>
        <p>
          Your request is saved as a draft under reference{' '}
          <span className="font-mono">{detail.requestNumber}</span>. It has not been sent to any
          department, and your government record still shows its current values.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Where Phase 4 ends.
 *
 * The honest alternative to a "Continue" button. Impact detection, target
 * selection and consent are the next stage, and a control that navigated to a
 * route that does not exist — or to a placeholder pretending to be that
 * stage — would misrepresent what SetuX can currently do.
 */
function PhaseBoundaryNotice() {
  return (
    <Alert>
      <Info aria-hidden />
      <AlertTitle>What happens next is not built yet</AlertTitle>
      <AlertDescription>
        <p>
          Choosing which other records this correction should apply to, giving consent and sending
          the request to the responsible department are part of the next stage of this service. Your
          draft is saved and you can come back to it from this page.
        </p>
      </AlertDescription>
    </Alert>
  );
}
