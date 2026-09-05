import { ArrowRight, CheckCircle2, ClipboardList, FileCheck2, XCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingState } from '@/components/feedback/loading-state';
import { cn } from '@/lib/utils';
import { useReviewDashboard } from '../hooks/use-review';
import { governmentErrorMessage } from '../utils/government-error';

/**
 * The officer's overview, from `reference/review.png`.
 *
 * The reference shows four metric cards above the working area. Ours carry the
 * four numbers that can actually be COUNTED from persisted rows in this
 * officer's department. The reference's "Approved Today" and its
 * "↗ 8 from yesterday" deltas are not reproduced: SetuX stores no daily
 * baseline to compare against, and a trend indicator that is not measured is a
 * decoration that reads as data (§10).
 *
 * Everything here comes from `GET /government/review`, which counts rows the
 * officer's department owns. Nothing is hard-coded.
 */
export function GovernmentDashboardPage() {
  const { data, isPending, isError, error, refetch } = useReviewDashboard();

  if (isPending) return <LoadingState label="Loading your review overview…" />;

  if (isError) {
    return (
      <ErrorState
        title="Could not load your overview"
        description={governmentErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scholarship Review</h1>
        <p className="text-sm text-muted-foreground">
          {data.officerName} · {data.department}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Awaiting review"
          value={data.awaitingReview}
          Icon={ClipboardList}
          tone="blue"
        />
        <MetricCard label="Approved" value={data.approved} Icon={CheckCircle2} tone="green" />
        <MetricCard label="Rejected" value={data.rejected} Icon={XCircle} tone="red" />
        <MetricCard
          label="Total reviewed"
          value={data.totalReviewed}
          Icon={FileCheck2}
          tone="slate"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Review applications</h2>
            <p className="text-sm text-muted-foreground">
              {data.awaitingReview === 0
                ? 'Nothing is waiting for you right now.'
                : `${data.awaitingReview} application${data.awaitingReview === 1 ? '' : 's'} verified by SetuX and waiting for your decision.`}
            </p>
          </div>

          <Button asChild className="shrink-0">
            <Link to="/government/applications">
              Review applications
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* The claim the whole prototype makes, stated where the officer acts on
          it. Not decoration: it is why the numbers above are trustworthy. */}
      <p className="text-xs text-muted-foreground">
        Verification results are produced by SetuX from records retrieved with the applicant's
        consent. They inform your decision; they never make it.
      </p>
    </div>
  );
}

const TONES = {
  blue: 'bg-primary/10 text-primary',
  green: 'bg-success/15 text-success',
  red: 'bg-destructive/10 text-destructive',
  slate: 'bg-muted text-muted-foreground',
} as const;

function MetricCard({
  label,
  value,
  Icon,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly Icon: ComponentType<{ className?: string }>;
  readonly tone: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', TONES[tone])} aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
