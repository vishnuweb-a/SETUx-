import { ArrowLeft, Building2, ChevronRight, GraduationCap, Info, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { RequirementList } from '../components/requirement-list';
import { useScholarship } from '../hooks/use-scholarships';
import {
  isInvalidScholarshipId,
  isScholarshipNotFound,
  toScholarshipErrorMessage,
} from '../utils/scholarship-error';

const CATALOGUE_PATH = '/citizen/services';

/**
 * One scholarship, with everything it requires.
 *
 * The layout follows `reference/service.png`: breadcrumb and title above, the
 * substance in a wide left column, and a summary card in a right rail that
 * carries the primary action.
 *
 * The Apply control is the phase boundary. It is rendered because the reference
 * shows it and because a catalogue whose entries cannot be acted on reads as
 * broken — but it creates nothing. Application creation, consent, document
 * retrieval and verification are Phase 6 and later (Phase 5 §18, §33).
 */
export function ScholarshipDetailPage() {
  const { scholarshipId = '' } = useParams<{ scholarshipId: string }>();
  const scholarship = useScholarship(scholarshipId);

  if (scholarship.isPending) {
    return <DetailSkeleton />;
  }

  // A malformed id and an unknown one are the same thing to someone following a
  // stale link, and an unpublished service is deliberately indistinguishable
  // from a missing one (Phase 5 §39).
  if (isScholarshipNotFound(scholarship.error) || isInvalidScholarshipId(scholarship.error)) {
    return <ScholarshipNotFound />;
  }

  if (scholarship.isError || !scholarship.data) {
    return (
      <div className="mx-auto max-w-5xl">
        <BackLink />
        <ErrorState
          className="mt-4"
          title="Could not load this scholarship"
          description={toScholarshipErrorMessage(scholarship.error)}
          onRetry={() => void scholarship.refetch()}
        />
      </div>
    );
  }

  const { name, description, department, requirements } = scholarship.data;
  const mandatoryCount = requirements.filter((requirement) => requirement.required).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Breadcrumb name={name} />
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{name}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="size-4 shrink-0" aria-hidden />
          {department}
        </p>
      </div>

      {/* Single column below `lg`, so the summary card follows the detail on a
          phone instead of being squeezed beside it. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="about-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 id="about-heading" className="text-lg font-semibold">
              About this scholarship
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </section>

          <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="requirements-heading" className="text-lg font-semibold">
                What you will need
              </h2>
              <p className="text-sm text-muted-foreground">
                {mandatoryCount} required · {requirements.length} in total
              </p>
            </div>

            <Alert>
              <ShieldCheck aria-hidden />
              <AlertDescription>
                SetuX retrieves these records from the departments that issued them, with your
                consent. You will not be asked to upload what government already holds.
              </AlertDescription>
            </Alert>

            <RequirementList requirements={requirements} />
          </section>
        </div>

        <ApplyPanel scholarshipName={name} department={department} />
      </div>
    </div>
  );
}

/**
 * The summary rail from the reference, and the Apply control.
 *
 * The reference's rail lists academic year, benefit amount and deadline. None
 * of those are columns on `services`, and inventing them would be fabricating
 * scheme terms on a government screen, so the rail carries what the schema
 * actually knows (AGENT.md §21, Phase 5 §26).
 */
function ApplyPanel({
  scholarshipName,
  department,
}: {
  readonly scholarshipName: string;
  readonly department: string;
}) {
  const [isNoticeVisible, setIsNoticeVisible] = useState(false);

  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary" aria-hidden>
          <GraduationCap className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Scholarship details</p>
          <p className="truncate text-xs text-muted-foreground">{department}</p>
        </div>
      </div>

      <dl className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Scholarship name</dt>
          <dd className="mt-0.5 font-medium text-balance">{scholarshipName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Offered by</dt>
          <dd className="mt-0.5 font-medium">{department}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-1">
            <Badge variant="secondary" className="font-normal">
              Accepting applications
            </Badge>
          </dd>
        </div>
      </dl>

      <Button className="w-full" onClick={() => setIsNoticeVisible(true)}>
        Apply now
        <ChevronRight className="size-4" aria-hidden />
      </Button>

      {/* The honest answer to a press: applications are not built yet. The
          notice must never read as a submitted application, because none was
          created — nothing on this screen writes anything (Phase 5 §33). */}
      {isNoticeVisible && (
        <Alert role="status">
          <Info aria-hidden />
          <AlertDescription>
            Applications open in the next step of the SetuX workflow. Nothing has been submitted
            and no application has been created.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        You can review everything this scholarship requires before you apply.
      </p>
    </aside>
  );
}

/** Breadcrumb from the reference: Services / Scholarships / this one. */
function Breadcrumb({ name }: { readonly name: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link
            to={CATALOGUE_PATH}
            className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Scholarships
          </Link>
        </li>
        <li aria-hidden>/</li>
        {/* `aria-current` marks the page itself; it is text, not a link, because
            a link to the page you are on is a dead control. */}
        <li aria-current="page" className="min-w-0 truncate font-medium text-foreground">
          {name}
        </li>
      </ol>
    </nav>
  );
}

function BackLink() {
  return (
    <Link
      to={CATALOGUE_PATH}
      className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to scholarships
    </Link>
  );
}

/**
 * The not-found state.
 *
 * Offers the way back to the catalogue rather than only reporting the failure —
 * someone who followed a stale link still wants a scholarship.
 */
function ScholarshipNotFound() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <BackLink />
      <EmptyState
        title="Scholarship not found"
        description="This scholarship is no longer available, or the link is incorrect."
        action={
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to={CATALOGUE_PATH}>Browse scholarships</Link>
          </Button>
        }
        className="bg-card"
      />
    </div>
  );
}

/**
 * The detail loading state.
 *
 * Holds the same two-column geometry as the loaded page so the content does not
 * jump into place when it arrives (Phase 5 §36).
 */
function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading scholarship…</span>

      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div
        className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        aria-hidden
      >
        <div className="flex flex-col gap-6">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>

        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}
