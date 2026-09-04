import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { ScholarshipCard } from '../components/scholarship-card';
import { ScholarshipCardSkeleton } from '../components/scholarship-card-skeleton';
import { ScholarshipFilters } from '../components/scholarship-filters';
import { ScholarshipPagination } from '../components/scholarship-pagination';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { useScholarshipDepartments, useScholarships } from '../hooks/use-scholarships';
import type { ScholarshipListPayload } from '../types/scholarship.types';
import { toScholarshipErrorMessage } from '../utils/scholarship-error';

/** Placeholders drawn while the first page loads — one screenful of the grid. */
const SKELETON_COUNT = 6;

/**
 * The citizen scholarship catalogue.
 *
 * Everything on screen comes from `GET /api/v1/services`: the cards, the
 * department chips and the page count. Nothing is hardcoded, and only services
 * the backend publishes are ever received (Phase 5 §30).
 *
 * Filter state lives in the URL rather than in component state. That is what
 * makes a filtered catalogue a link — shareable, restorable by reload, and
 * correct after the browser's Back button, which is the behaviour §47 asks for.
 */
export function ScholarshipCataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchParam = searchParams.get('search') ?? '';
  const department = searchParams.get('department');
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;

  // The box is controlled locally so typing is never delayed; only the query
  // waits for the pause.
  const [searchInput, setSearchInput] = useState(searchParam);

  // Back/forward changes the URL without remounting this component, so the box
  // has to follow a parameter that moved underneath it. Adjusting during render
  // rather than in an effect is React's own pattern for deriving state from a
  // changed prop: the re-render happens before anything is painted, so the box
  // never shows the stale term (react.dev, "You Might Not Need an Effect").
  const [syncedSearchParam, setSyncedSearchParam] = useState(searchParam);

  if (syncedSearchParam !== searchParam) {
    setSyncedSearchParam(searchParam);
    setSearchInput(searchParam);
  }

  const debouncedSearch = useDebouncedValue(searchInput);

  // Writing the debounced term back to the URL is what actually issues the
  // request — the query below reads the URL, not the input.
  //
  // The debounced value trails the box by design, so after any change that
  // comes from *outside* the box — Clear filters, or Back — it still holds the
  // previous term for one delay. Committing that would undo the change the
  // citizen just made. Waiting until the debounce has caught up with the box is
  // what makes the URL, not a stale timer, the last word.
  useEffect(() => {
    if (debouncedSearch !== searchInput) return;
    if (debouncedSearch === searchParam) return;

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch.trim()) next.set('search', debouncedSearch);
        else next.delete('search');
        // A new search invalidates the current page number: page 3 of the old
        // result set is unlikely to exist in the new one.
        next.delete('page');
        return next;
      },
      // Replace, so a search term does not leave one history entry per pause.
      { replace: true },
    );
  }, [debouncedSearch, searchInput, searchParam, setSearchParams]);

  const query = {
    ...(searchParam.trim() ? { search: searchParam } : {}),
    ...(department ? { department } : {}),
    page,
  };

  const catalogue = useScholarships(query);
  const departments = useScholarshipDepartments();

  const isFiltered = searchParam.trim().length > 0 || department !== null;

  const updateParams = (mutate: (params: URLSearchParams) => void): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      mutate(next);
      return next;
    });
  };

  const handleDepartmentChange = (value: string | null): void => {
    updateParams((params) => {
      if (value) params.set('department', value);
      else params.delete('department');
      params.delete('page');
    });
  };

  const handleClear = (): void => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  const handlePageChange = (nextPage: number): void => {
    updateParams((params) => {
      if (nextPage > 1) params.set('page', String(nextPage));
      else params.delete('page');
    });
    // The grid is replaced below the fold on a long page; without this the new
    // page opens scrolled to its middle.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scholarships</h1>
        <p className="text-sm text-muted-foreground">
          Browse scholarships offered through SetuX. Open one to see what it requires before you
          apply.
        </p>
      </header>

      <ScholarshipFilters
        search={searchInput}
        onSearchChange={setSearchInput}
        department={department}
        onDepartmentChange={handleDepartmentChange}
        // An empty array while the options load, so the filter row appears with
        // the results rather than half-populated.
        departments={departments.data?.departments ?? []}
        onClear={handleClear}
        isFiltered={isFiltered}
      />

      <CatalogueResults
        isPending={catalogue.isPending}
        isFetching={catalogue.isFetching}
        isError={catalogue.isError}
        error={catalogue.error}
        onRetry={() => void catalogue.refetch()}
        data={catalogue.data}
        isFiltered={isFiltered}
        onClearFilters={handleClear}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

/**
 * The result region: loading, error, empty or the grid.
 *
 * Split out so the page above reads as state management and this reads as
 * rendering. The four branches are exhaustive and mutually exclusive, which is
 * what keeps a failed request from also rendering an empty state.
 */
function CatalogueResults({
  isPending,
  isFetching,
  isError,
  error,
  onRetry,
  data,
  isFiltered,
  onClearFilters,
  onPageChange,
}: {
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly data: ScholarshipListPayload | undefined;
  readonly isFiltered: boolean;
  readonly onClearFilters: () => void;
  readonly onPageChange: (page: number) => void;
}) {
  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading scholarships…</span>
        <ScholarshipGrid>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <li key={index}>
              <ScholarshipCardSkeleton />
            </li>
          ))}
        </ScholarshipGrid>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load scholarships"
        description={toScholarshipErrorMessage(error)}
        onRetry={onRetry}
      />
    );
  }

  if (data.items.length === 0) {
    // The two empty states are deliberately different. "No scholarships match
    // your filters" must not be shown when the catalogue itself is empty, or it
    // blames the citizen for a platform state (Phase 5 §37).
    return isFiltered ? (
      <EmptyState
        title="No scholarships match your filters"
        description="Try a different search term, or choose another department."
        action={
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Clear filters
          </button>
        }
        className="bg-card"
      />
    ) : (
      <EmptyState
        title="No scholarships are available yet"
        description="New services appear here as departments publish them through SetuX."
        className="bg-card"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* `aria-busy` marks the stale grid while the next page loads; the cards
          stay on screen rather than being replaced by skeletons. */}
      <ScholarshipGrid aria-busy={isFetching}>
        {data.items.map((scholarship) => (
          <li key={scholarship.id}>
            <ScholarshipCard scholarship={scholarship} />
          </li>
        ))}
      </ScholarshipGrid>

      <ScholarshipPagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        onPageChange={onPageChange}
        isBusy={isFetching}
      />
    </div>
  );
}

/**
 * The responsive card grid.
 *
 * One column on a phone, two on a tablet, three at the reference's desktop
 * width. `items-stretch` is what makes every card in a row share the tallest
 * card's height, so the footers line up (Phase 5 §40).
 */
function ScholarshipGrid({
  children,
  ...props
}: {
  readonly children: ReactNode;
} & HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className="grid list-none grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
      {...props}
    >
      {children}
    </ul>
  );
}
