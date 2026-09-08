import { ArrowRight, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChangeFieldEditor } from './change-field-editor';
import { validateChangeDraftFields } from '../utils/change-draft-validation';
import type { ChangeFieldPolicy } from '../types/change-draft.types';

/**
 * The correction form itself: a row per field, and the bar that saves it.
 *
 * Shared by the create screen and the saved-draft screen, because the two show
 * the same form over different starting data. What differs between them —
 * whether saving POSTs or PATCHes, where "Back" goes — is passed in, so the
 * form does not know which case it is in and cannot behave differently by
 * accident.
 *
 * State lives here and is seeded from `fields`. That is deliberate for a form:
 * a controlled input tied directly to server data would discard a citizen's
 * half-typed value on every background refetch.
 */
export interface ChangeDraftFormField {
  readonly fieldKey: string;
  readonly currentValue: unknown;
  readonly initialValue: string;
  readonly initialReason: string;
  readonly policy: ChangeFieldPolicy;
}

/** What one field contributes to a save. */
export interface ChangeDraftFormValue {
  readonly proposedValue: string;
  readonly reason: string;
}

export interface ChangeDraftFormProps {
  readonly fields: readonly ChangeDraftFormField[];
  /** Rendered above the form when the last save failed. */
  readonly submitError: string | null;
  readonly isSaving: boolean;
  readonly saveLabel: string;
  readonly onSave: (values: Readonly<Record<string, ChangeDraftFormValue>>) => void;
  readonly onBack: () => void;
  /** Rendered under the form once a draft has been saved. */
  readonly footer?: React.ReactNode;
}

const initialValues = (
  fields: readonly ChangeDraftFormField[],
): Record<string, string> =>
  Object.fromEntries(fields.map((field) => [field.fieldKey, field.initialValue]));

const initialReasons = (
  fields: readonly ChangeDraftFormField[],
): Record<string, string> =>
  Object.fromEntries(fields.map((field) => [field.fieldKey, field.initialReason]));

export function ChangeDraftForm({
  fields,
  submitError,
  isSaving,
  saveLabel,
  onSave,
  onBack,
  footer,
}: ChangeDraftFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));

  // Reasons are held separately from values because they validate differently:
  // a blank reason is valid and a blank value is not, so folding them into one
  // record would invite a validator that treats them alike.
  const [reasons, setReasons] = useState<Record<string, string>>(() => initialReasons(fields));

  /**
   * Errors are shown only after a save attempt.
   *
   * Validating on every keystroke would mark a field invalid while the citizen
   * is still in the middle of typing into it, which reads as the form
   * disagreeing with them rather than helping.
   */
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [hasAttempted, setHasAttempted] = useState(false);

  const handleChange = (fieldKey: string, value: string): void => {
    setValues((current) => ({ ...current, [fieldKey]: value }));

    // Clear a field's error as soon as it becomes valid, so a corrected field
    // stops complaining without waiting for another save.
    if (hasAttempted) {
      setErrors((current) => {
        if (!current.has(fieldKey)) return current;

        const field = fields.find((candidate) => candidate.fieldKey === fieldKey);
        if (field === undefined) return current;

        const next = new Map(current);
        const stillInvalid =
          validateChangeDraftFields([field], { ...values, [fieldKey]: value }).get(fieldKey) ??
          null;

        if (stillInvalid === null) next.delete(fieldKey);
        else next.set(fieldKey, stillInvalid);

        return next;
      });
    }
  };

  const handleReasonChange = (fieldKey: string, value: string): void => {
    setReasons((current) => ({ ...current, [fieldKey]: value }));
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    setHasAttempted(true);

    const found = validateChangeDraftFields(fields, values);
    setErrors(found);

    // The server re-validates all of this regardless. Stopping here simply
    // spares the citizen a round trip to be told what the form already knows.
    if (found.size > 0) return;

    onSave(
      Object.fromEntries(
        fields.map((f) => [
          f.fieldKey,
          {
            proposedValue: values[f.fieldKey]?.trim() ?? '',
            reason: reasons[f.fieldKey]?.trim() ?? '',
          },
        ]),
      ),
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {submitError !== null && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Your request could not be saved</AlertTitle>
          <AlertDescription>
            <p>{submitError}</p>
          </AlertDescription>
        </Alert>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {fields.map((field) => (
          <ChangeFieldEditor
            key={field.fieldKey}
            fieldKey={field.fieldKey}
            currentValue={field.currentValue}
            proposedValue={values[field.fieldKey] ?? ''}
            reason={reasons[field.fieldKey] ?? ''}
            policy={field.policy}
            error={errors.get(field.fieldKey) ?? null}
            disabled={isSaving}
            onChange={handleChange}
            onReasonChange={handleReasonChange}
          />
        ))}
      </ul>

      {footer}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onBack} disabled={isSaving}>
            Back
          </Button>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : saveLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </form>
  );
}
