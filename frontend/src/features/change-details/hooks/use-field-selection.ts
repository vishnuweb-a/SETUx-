import { useCallback, useMemo, useState } from 'react';
import type { CitizenRecordField } from '../types/change-details.types';
import { fieldEligibility } from '../utils/field-eligibility';

/**
 * Which fields the citizen has chosen to correct.
 *
 * Multiple fields are supported because the architecture supports them:
 * feature.md's Phase 3 acceptance requires "multiple fields supported where
 * policy allows", and one correction covering a name and an address is one
 * trip through review rather than two.
 *
 * The selection holds field *keys* and nothing else — no proposed value, no
 * reason, no evidence. Those belong to the next phase, and admitting them here
 * would build its form early.
 *
 * State is local and transient by design. Phase 3 creates no draft, so there is
 * nothing to resume; persisting a selection would be a Phase 4 schema decision
 * taken early (feature.md Phase 3 §4).
 */
export interface FieldSelection {
  readonly selectedKeys: readonly string[];
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  readonly isSelected: (fieldKey: string) => boolean;
  readonly toggle: (field: CitizenRecordField) => void;
  readonly clear: () => void;
}

export const useFieldSelection = (): FieldSelection => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((field: CitizenRecordField): void => {
    // The guard is what keeps a locked field unselectable even if a caller
    // wires up a control that should not exist. It is not the security
    // boundary — that is the server's `assertFieldEditable`, re-checked when a
    // proposed value is finally submitted — but it keeps this state honest.
    if (!fieldEligibility(field).isSelectable) return;

    setSelected((current) => {
      const next = new Set(current);
      if (next.has(field.fieldKey)) {
        next.delete(field.fieldKey);
      } else {
        next.add(field.fieldKey);
      }
      return next;
    });
  }, []);

  const clear = useCallback((): void => setSelected(new Set()), []);

  const isSelected = useCallback((fieldKey: string): boolean => selected.has(fieldKey), [selected]);

  // Sorted so the handoff is stable: the same three fields produce the same
  // list whatever order they were ticked in.
  const selectedKeys = useMemo(() => [...selected].sort(), [selected]);

  return {
    selectedKeys,
    selectedCount: selectedKeys.length,
    hasSelection: selectedKeys.length > 0,
    isSelected,
    toggle,
    clear,
  };
};
