import { Lock } from 'lucide-react';
import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CitizenRecordField } from '../types/change-details.types';
import { fieldEligibility } from '../utils/field-eligibility';
import { fieldLabel, formatFieldValue } from '../utils/record-presentation';

/**
 * One field of a record, with its current value and what may be done to it.
 *
 * A selectable field is a `<label>` wrapping a real checkbox, so the whole row
 * is a click target and the accessible name is the field's own label — no
 * `aria-label` needed, and keyboard selection works because the control is a
 * checkbox rather than a div pretending to be one.
 *
 * A locked field renders the same information without the control. It is never
 * hidden: a citizen reading their record needs to see all of it, and "this
 * cannot be changed, and here is who owns it" is the useful answer.
 */

interface RecordFieldRowProps {
  readonly field: CitizenRecordField;
  readonly isSelected: boolean;
  readonly onToggle: (field: CitizenRecordField) => void;
}

export function RecordFieldRow({ field, isSelected, onToggle }: RecordFieldRowProps) {
  const eligibility = fieldEligibility(field);
  const helperId = useId();

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{fieldLabel(field.fieldKey)}</span>
          <Badge variant={eligibility.badgeVariant}>
            {!eligibility.isSelectable && <Lock aria-hidden />}
            {eligibility.badgeLabel}
          </Badge>
        </div>

        <p className="mt-1 break-words text-sm text-muted-foreground">
          {formatFieldValue(field.value)}
        </p>

        {/* The explanation, always present. The lock icon in the badge is a
            reinforcement of this sentence, never the only way to learn the
            field's state. */}
        <p id={helperId} className="mt-1 text-xs text-muted-foreground">
          {eligibility.helperText}
        </p>
      </div>
    </>
  );

  if (!eligibility.isSelectable) {
    return (
      <li className="flex items-start gap-3 bg-muted/30 px-4 py-4 sm:px-5">
        <span
          className="mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground"
          aria-hidden
        >
          <Lock className="size-4" />
        </span>
        {body}
      </li>
    );
  }

  return (
    <li>
      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 px-4 py-4 transition-colors hover:bg-accent/40 has-focus-visible:bg-accent/40 sm:px-5',
          isSelected && 'bg-primary/5',
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(field)}
          aria-describedby={helperId}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        {body}
      </label>
    </li>
  );
}
