import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ScholarshipPaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  /** Disables both controls while the next page is in flight. */
  readonly isBusy: boolean;
}

/**
 * Page controls for the catalogue.
 *
 * The pager is rendered only when there is more than one page, so a small
 * catalogue is not decorated with controls that can do nothing.
 *
 * The count is announced through `aria-live` because changing pages replaces
 * the grid without moving focus — without it, a screen-reader user would hear
 * nothing at all in response to their own click.
 */
export function ScholarshipPagination({
  page,
  totalPages,
  total,
  onPageChange,
  isBusy,
}: ScholarshipPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Scholarship pages"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages} · {total} {total === 1 ? 'scholarship' : 'scholarships'}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={isBusy || page <= 1}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={isBusy || page >= totalPages}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
