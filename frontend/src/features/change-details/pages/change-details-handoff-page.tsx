import { ChevronRight, Info } from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fieldLabel } from '../utils/record-presentation';
import type { FieldSelectionHandoff } from '../types/change-details.types';

/**
 * Where Phase 3 ends.
 *
 * The citizen has chosen a record and the details they want corrected. The form
 * that collects a new value for each — and the draft that stores it — is the
 * next phase's work, so this screen confirms the selection and stops.
 *
 * It is deliberately not a form. Showing an inert "new value" box here would
 * promise an edit this phase cannot save.
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

export function ChangeDetailsHandoffPage() {
  const { recordId = '' } = useParams<{ recordId: string }>();
  const { state } = useLocation();
  const handoff = readHandoff(state);

  // Reached directly, reloaded, or opened from a bookmark. The selection lives
  // in navigation state and this phase persists nothing, so there is nothing to
  // restore — the citizen is returned to the record to choose again rather than
  // shown an empty page that looks broken.
  if (handoff === null || handoff.recordId !== recordId) {
    return <Navigate to={`/citizen/change-details/${recordId}`} replace />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link
              to="/citizen/change-details"
              className="rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Change Details
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-4" />
          </li>
          <li>
            <Link
              to={`/citizen/change-details/${recordId}`}
              className="rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Record
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-4" />
          </li>
          <li aria-current="page" className="font-medium text-foreground">
            Selected fields
          </li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Selected fields ready for editing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the details you asked to correct. Nothing has been submitted, and your record is
          unchanged.
        </p>
      </header>

      <section
        aria-labelledby="selected-fields-heading"
        className="rounded-2xl border border-border bg-card p-5"
      >
        <h2 id="selected-fields-heading" className="text-sm font-medium text-muted-foreground">
          {handoff.selectedFieldKeys.length}{' '}
          {handoff.selectedFieldKeys.length === 1 ? 'field' : 'fields'} selected
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {handoff.selectedFieldKeys.map((fieldKey) => (
            <li key={fieldKey} className="rounded-xl border border-border px-4 py-3 font-medium">
              {fieldLabel(fieldKey)}
            </li>
          ))}
        </ul>
      </section>

      <Alert>
        <Info aria-hidden />
        <AlertTitle>The correction form is not built yet</AlertTitle>
        <AlertDescription>
          <p>
            Entering new values, attaching evidence and submitting a correction request are part of
            the next stage of this service. Your government record has not been changed.
          </p>
        </AlertDescription>
      </Alert>

      <div>
        <Button asChild variant="outline">
          <Link to={`/citizen/change-details/${recordId}`}>Back to record</Link>
        </Button>
      </div>
    </div>
  );
}
