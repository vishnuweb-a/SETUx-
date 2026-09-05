import { ArrowRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { SkeletonList } from '@/components/feedback/loading-state';
import { cn } from '@/lib/utils';
import { useReviewQueue } from '../hooks/use-review';
import type { ReviewQueueFilter, ReviewQueueItem } from '../types/government.types';
import { governmentErrorMessage } from '../utils/government-error';
import { OfficerStatusBadge } from '../components/officer-status-badge';

/**
 * Applications in this officer's department.
 *
 * The filter lives in the URL rather than in component state, so a filtered
 * queue can be linked to and survives a reload — an officer who refreshes mid-
 * triage stays where they were.
 *
 * The three tabs are the three states an officer's work divides into. There is
 * no "All" tab: it would mix decided and undecided work into one list whose top
 * row means nothing in particular.
 */
const FILTERS: readonly { readonly value: ReviewQueueFilter; readonly label: string }[] = [
  { value: 'VERIFICATION', label: 'Awaiting review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const isFilter = (value: string | null): value is ReviewQueueFilter =>
  FILTERS.some((filter) => filter.value === value);

export function ReviewQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status: ReviewQueueFilter = isFilter(statusParam) ? statusParam : 'VERIFICATION';

  const { data, isPending, isError, error, refetch } = useReviewQueue(status);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Applications your department handles, with what SetuX found.
        </p>
      </header>

      <div role="tablist" aria-label="Filter applications" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const isActive = filter.value === status;
          return (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSearchParams({ status: filter.value })}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isActive
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {isPending && <SkeletonList rows={4} />}

      {isError && (
        <ErrorState
          title="Could not load applications"
          description={governmentErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title={
            status === 'VERIFICATION'
              ? 'Nothing is waiting for review'
              : status === 'APPROVED'
                ? 'No approved applications yet'
                : 'No rejected applications yet'
          }
          description={
            status === 'VERIFICATION'
              ? 'Applications appear here once SetuX has verified the information an applicant consented to share.'
              : 'Decisions you record will be listed here.'
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Two presentations of one dataset. The table is what the reference
              shows and is right where there is room for columns; below `lg`
              those columns cannot fit without a horizontal scroll, so the same
              rows render as cards instead. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Applications in your department, newest activity first
              </caption>
              <thead className="border-b border-border bg-muted/40 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Application</th>
                  <th scope="col" className="px-4 py-3 font-medium">Applicant</th>
                  <th scope="col" className="px-4 py-3 font-medium">Scholarship</th>
                  <th scope="col" className="px-4 py-3 font-medium">Verification</th>
                  <th scope="col" className="px-4 py-3 font-medium">Submitted</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.applicationId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{item.applicationNumber}</td>
                    <td className="px-4 py-3">{item.citizenName}</td>
                    <td className="px-4 py-3">{item.serviceName}</td>
                    <td className="px-4 py-3"><VerificationSummaryText item={item} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(item.submittedAt)}
                    </td>
                    <td className="px-4 py-3"><OfficerStatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/government/applications/${item.applicationId}`}>
                          {item.status === 'VERIFICATION' ? 'Review' : 'View'}
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {data.items.map((item) => (
              <li key={item.applicationId}>
                <Card>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{item.applicationNumber}</p>
                        <p className="truncate text-sm text-muted-foreground">{item.citizenName}</p>
                      </div>
                      <OfficerStatusBadge status={item.status} />
                    </div>

                    <dl className="space-y-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Scholarship</dt>
                        <dd className="min-w-0 flex-1 truncate text-right">{item.serviceName}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Verification</dt>
                        <dd className="min-w-0 flex-1 text-right">
                          <VerificationSummaryText item={item} />
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Submitted</dt>
                        <dd className="min-w-0 flex-1 text-right">{formatDate(item.submittedAt)}</dd>
                      </div>
                    </dl>

                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to={`/government/applications/${item.applicationId}`}>
                        {item.status === 'VERIFICATION' ? 'Review application' : 'View application'}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            Showing {data.items.length} of {data.total} application{data.total === 1 ? '' : 's'}.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The verification picture in one line.
 *
 * Counts, never a verdict. "3 verified" is a fact about the evidence; "ready to
 * approve" would be a recommendation, and the officer's judgement is what this
 * screen exists to collect rather than to anticipate (§4).
 */
function VerificationSummaryText({ item }: { readonly item: ReviewQueueItem }) {
  const { verified, failed, requiresAction, total } = item.verificationSummary;

  if (total === 0) {
    return <span className="text-muted-foreground">Not verified yet</span>;
  }

  return (
    <span className="text-muted-foreground">
      <span className="font-medium text-foreground">{verified}</span> of {total} verified
      {failed > 0 && <span className="text-warning-foreground"> · {failed} could not be verified</span>}
      {requiresAction > 0 && <span className="text-warning-foreground"> · {requiresAction} needs review</span>}
    </span>
  );
}

const formatDate = (value: string | null): string =>
  value === null
    ? '—'
    : new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
