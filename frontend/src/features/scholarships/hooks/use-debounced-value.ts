import { useEffect, useState } from 'react';

/** Long enough to coalesce a burst of typing, short enough to feel immediate. */
const DEFAULT_DELAY_MS = 300;

/**
 * The value, held back until it has stopped changing.
 *
 * Used for the catalogue's search box so a query is issued once per pause
 * rather than once per keystroke. The input itself stays uncontrolled by this —
 * what the citizen typed appears immediately; only the request waits — which is
 * why the debounce belongs here and not in the field (Phase 5 §22).
 */
export const useDebouncedValue = <TValue>(value: TValue, delayMs = DEFAULT_DELAY_MS): TValue => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    // Clearing on every change is what makes this a debounce rather than a
    // queue of delayed updates.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
