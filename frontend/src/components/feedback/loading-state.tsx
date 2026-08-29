import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface LoadingStateProps {
  /** Describes what is loading, for both sighted users and screen readers. */
  label?: string;
  className?: string;
}

/**
 * Generic inline pending indicator.
 *
 * Use for short waits where a spinner reads better than a layout placeholder.
 * For content-shaped waits prefer `SkeletonList`.
 */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export interface SkeletonListProps {
  /** Number of placeholder rows to render. */
  rows?: number;
  className?: string;
}

/** Layout-preserving placeholder for list-shaped content that is still loading. */
export function SkeletonList({ rows = 3, className }: SkeletonListProps) {
  return (
    <div role="status" aria-live="polite" className={cn('space-y-2', className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" aria-hidden />
      ))}
    </div>
  );
}
