import { Skeleton } from '@/components/ui/skeleton';

/**
 * The catalogue's loading state.
 *
 * Mirrors the geometry of {@link ScholarshipCard} — same padding, radius, icon
 * square and line rhythm — so the grid does not jump when the data arrives
 * (Phase 5 §36).
 *
 * The grid that renders these carries the live region and the "Loading" text,
 * so each card is `aria-hidden`: a screen reader should hear that the catalogue
 * is loading once, not once per placeholder.
 */
export function ScholarshipCardSkeleton() {
  return (
    <div
      className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      aria-hidden
    >
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
