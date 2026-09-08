import { formatFieldValue } from './record-presentation';

/**
 * Presentation helpers for the change draft (Phase 4).
 *
 * Kept out of the form component so that file exports components alone — which
 * is what lets Vite's fast refresh replace the form without remounting the tree
 * and discarding whatever the citizen has typed into it.
 */

/**
 * The text an input starts with for a stored proposed value.
 *
 * An absent proposal becomes an empty string rather than the em-dash
 * `formatFieldValue` renders for a missing value: a placeholder is the right
 * answer for a value being DISPLAYED and the wrong one for a value being
 * EDITED, where it would become literal text the citizen has to delete.
 */
export const proposedValueText = (value: unknown): string =>
  value === null || value === undefined ? '' : formatFieldValue(value);
