import { CircleAlert, Info } from 'lucide-react';
import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { fieldLabel, formatFieldValue } from '../utils/record-presentation';
import type { ChangeFieldPolicy } from '../types/change-draft.types';

/**
 * One field of the correction form: what the government holds, and what the
 * citizen is asking for instead.
 *
 * The two values are given deliberately different weight. The current value is
 * rendered as static text on a muted surface — it is a fact about the record,
 * not something the citizen can act on — while the new value is the only
 * interactive control in the row. A citizen scanning the form should be able to
 * tell at a glance which column is theirs to change, without reading a label to
 * find out.
 *
 * The current value is NOT an input, not even a disabled or read-only one. A
 * disabled input still looks like a field that might become editable, and this
 * one never will: it is the source's value, and SetuX does not offer to
 * overwrite it here.
 */
export interface ChangeFieldEditorProps {
  readonly fieldKey: string;
  readonly currentValue: unknown;
  readonly proposedValue: string;
  /** The citizen's explanation. Empty string when they have written none. */
  readonly reason: string;
  readonly policy: ChangeFieldPolicy;
  /** A validation message for this field, or `null` when it is valid. */
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onChange: (fieldKey: string, value: string) => void;
  readonly onReasonChange: (fieldKey: string, value: string) => void;
}

/**
 * What a conditionally-editable correction additionally requires.
 *
 * One sentence rather than two badges the citizen must combine themselves —
 * the same wording rule `field-eligibility.ts` applies on the record screen, so
 * a citizen meets consistent language across the flow.
 *
 * Evidence upload is NOT offered here. The warning states the requirement
 * honestly; collecting the document belongs to a later phase, and an upload
 * control that discarded its file would be worse than no control at all.
 */
const requirementText = (policy: ChangeFieldPolicy): string => {
  if (policy.requiresEvidence && policy.requiresReview) {
    return 'This change may require supporting evidence and department review.';
  }
  if (policy.requiresEvidence) return 'This change may require supporting evidence.';
  if (policy.requiresReview) return 'This change may require department review.';

  return 'This change may need additional checks before it is accepted.';
};

const authorityText = (policy: ChangeFieldPolicy): string | null =>
  policy.authority === null ? null : `Maintained by ${policy.authority}.`;

export function ChangeFieldEditor({
  fieldKey,
  currentValue,
  proposedValue,
  reason,
  policy,
  error,
  disabled,
  onChange,
  onReasonChange,
}: ChangeFieldEditorProps) {
  // `useId` rather than the field key: keys are safe as ids today, but an id
  // derived from data is one seed change away from colliding or from producing
  // something invalid, and the label/input association is what a screen reader
  // depends on.
  const inputId = useId();
  const currentId = useId();
  const reasonId = useId();
  const noteId = useId();
  const errorId = useId();

  const isConditional = policy.editability === 'CONDITIONALLY_EDITABLE';
  const authority = authorityText(policy);

  // Only ids that actually render may be referenced. A dangling
  // `aria-describedby` is announced as nothing by some screen readers and as an
  // error by others.
  const describedBy = [isConditional ? noteId : null, error !== null ? errorId : null]
    .filter((id): id is string => id !== null)
    .join(' ');

  return (
    <li className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{fieldLabel(fieldKey)}</h3>
        {isConditional && <Badge variant="warning">Conditionally editable</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span id={currentId} className="text-xs font-medium text-muted-foreground">
            Current value
          </span>
          {/* aria-labelledby rather than a <label>: this is static text, not a
              form control, and labelling it as one would announce a field the
              citizen cannot enter. */}
          <p
            aria-labelledby={currentId}
            className="min-h-9 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm break-words"
          >
            {formatFieldValue(currentValue)}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
            New value
          </label>
          <Input
            id={inputId}
            name={fieldKey}
            value={proposedValue}
            disabled={disabled}
            aria-invalid={error !== null}
            aria-describedby={describedBy === '' ? undefined : describedBy}
            onChange={(event) => onChange(fieldKey, event.target.value)}
          />
        </div>
      </div>

      {/*
        Why the citizen says the value is wrong.

        Optional, and labelled as such rather than merely permitted to be
        empty — a field that looks required but is not teaches a citizen to
        distrust the ones that are. It is what an officer will read first:
        "Demo Old Name → Demo New Name" says what changed and nothing about why
        it should (arch §4.5).
      */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-xs font-medium text-muted-foreground">
          Reason for this change <span className="font-normal">(optional)</span>
        </label>
        <Input
          id={reasonId}
          name={`${fieldKey}Reason`}
          value={reason}
          disabled={disabled}
          placeholder="For example, legal name change"
          onChange={(event) => onReasonChange(fieldKey, event.target.value)}
        />
      </div>

      {isConditional && (
        <p id={noteId} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            {requirementText(policy)}
            {authority !== null && ` ${authority}`}
          </span>
        </p>
      )}

      {error !== null && (
        // The icon is decorative; the message carries the meaning. Colour is
        // never the only signal (AGENT.md §18).
        <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </li>
  );
}
