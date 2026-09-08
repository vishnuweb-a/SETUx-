import { formatFieldValue } from './record-presentation';

/**
 * Client-side validation for the correction form.
 *
 * This is a COURTESY, not a control. Every rule here is enforced again on the
 * server — by the Zod schema at the edge, by the service, and by a CHECK
 * constraint in the database — and the server's answer is the one that decides
 * whether a draft is written. What this file buys is that a citizen who leaves
 * a field blank learns so immediately rather than after a round trip.
 *
 * The rules deliberately mirror the server's exactly. A client rule the server
 * does not have would block a request the server would have accepted; a server
 * rule the client does not have surfaces as an error the citizen could have
 * been warned about earlier. Where they must differ, the server is stricter.
 */

/** Matches the backend's `MAX_PROPOSED_VALUE_LENGTH`. */
const MAX_VALUE_LENGTH = 512;

/**
 * Validates one proposed value against the source value it would replace.
 *
 * Returns `null` when valid, or a sentence the citizen can act on.
 *
 * The unchanged check compares against the value FORMATTED for display, which
 * is what the citizen is looking at. Comparing against the raw value would call
 * `2026` and `"2026"` different when the screen shows one thing — and the
 * server, which compares the underlying JSON, would then reject a request this
 * form had accepted.
 */
export const validateProposedValue = (
  currentValue: unknown,
  proposedValue: string,
): string | null => {
  const trimmed = proposedValue.trim();

  if (trimmed === '') return 'Enter a new value.';

  if (trimmed.length > MAX_VALUE_LENGTH) {
    return `Enter ${MAX_VALUE_LENGTH} characters or fewer.`;
  }

  if (trimmed === formatFieldValue(currentValue)) {
    return 'Enter a value that is different from the current one.';
  }

  return null;
};

/**
 * Validates every field, returning the errors by field key.
 *
 * An empty map means the form may be submitted. Every invalid field is reported
 * at once rather than one at a time: a citizen correcting three details should
 * see all three problems, not discover them in sequence.
 */
export const validateChangeDraftFields = (
  fields: readonly { readonly fieldKey: string; readonly currentValue: unknown }[],
  values: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> => {
  const errors = new Map<string, string>();

  for (const field of fields) {
    const error = validateProposedValue(field.currentValue, values[field.fieldKey] ?? '');
    if (error !== null) errors.set(field.fieldKey, error);
  }

  return errors;
};
