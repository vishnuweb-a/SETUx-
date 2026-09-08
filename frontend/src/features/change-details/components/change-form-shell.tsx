import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The frame shared by the two correction-form screens.
 *
 * Both the create form (reached from a field selection) and the draft form
 * (reached from a saved draft's URL) show the same breadcrumb, heading and
 * assurance line. Factoring the frame out is what keeps them from drifting into
 * two subtly different versions of the same screen — the failure the
 * `record-presentation` labels table exists to prevent for vocabulary, applied
 * to layout.
 *
 * `pb-28` leaves room for the fixed action bar, which would otherwise cover the
 * last field on a phone.
 */
/**
 * The assurance line shown under the heading on the two FORM screens.
 *
 * Phrased for a screen with inputs on it. A read-only screen overrides it —
 * telling somebody to "enter what each detail should say" on a page with
 * nothing to type into is worse than saying nothing.
 */
const DEFAULT_SUBHEADING =
  'Enter what each detail should say. Your government record is not changed by saving this request.';

export interface ChangeFormShellProps {
  readonly heading: string;
  /**
   * The line under the heading.
   *
   * Defaults to the form wording. Every screen using this shell states SOME
   * version of "nothing official has changed", because it is the thing a
   * citizen is most likely to be uncertain about — what varies is whether the
   * screen is asking them to type.
   */
  readonly subheading?: string;
  /** Where "Record" in the breadcrumb points, when the record is known. */
  readonly recordId: string | null;
  readonly breadcrumbLeaf: string;
  readonly children: React.ReactNode;
}

export function ChangeFormShell({
  heading,
  subheading = DEFAULT_SUBHEADING,
  recordId,
  breadcrumbLeaf,
  children,
}: ChangeFormShellProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-28">
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
          {recordId !== null && (
            <>
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
            </>
          )}
          <li aria-hidden>
            <ChevronRight className="size-4" />
          </li>
          <li aria-current="page" className="font-medium text-foreground">
            {breadcrumbLeaf}
          </li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
        {/* Stated on every screen of this flow, because it is the thing a
            citizen is most likely to be uncertain about: asking for a change
            does not make one. */}
        <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
      </header>

      {children}
    </div>
  );
}

export function ChangeFormSkeleton() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex max-w-3xl flex-col gap-6">
      <span className="sr-only">Loading correction request…</span>
      <Skeleton className="h-8 w-64" aria-hidden />
      <Skeleton className="h-64 w-full rounded-2xl" aria-hidden />
    </div>
  );
}
