import { Search, X } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ScholarshipFiltersProps {
  /** The live text in the box — the caller debounces before querying. */
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  /** `null` means "All departments". */
  readonly department: string | null;
  readonly onDepartmentChange: (department: string | null) => void;
  readonly departments: readonly string[];
  readonly onClear: () => void;
  readonly isFiltered: boolean;
}

/**
 * Search and department filters for the catalogue.
 *
 * Both controls are functional: each drives the API query the grid is rendered
 * from, and neither is decoration (Phase 5 §22, §23).
 *
 * The department filter is a row of chips rather than a `<select>` because the
 * reference's catalogue chrome uses pills and the option count is small and
 * fixed by the seed. They are real `<button>`s in a labelled group, so the set
 * is announced and operable from the keyboard.
 */
export function ScholarshipFilters({
  search,
  onSearchChange,
  department,
  onDepartmentChange,
  departments,
  onClear,
  isFiltered,
}: ScholarshipFiltersProps) {
  const searchId = useId();
  const groupLabelId = useId();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          {/* Visually hidden rather than absent: the placeholder disappears the
              moment anything is typed, so it cannot be the field's only name. */}
          <label htmlFor={searchId} className="sr-only">
            Search scholarships
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search scholarships by name or department…"
            className="pl-9"
          />
        </div>

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={onClear} className="sm:shrink-0">
            <X className="size-4" aria-hidden />
            Clear filters
          </Button>
        )}
      </div>

      {departments.length > 0 && (
        <div className="flex flex-col gap-2">
          <span id={groupLabelId} className="text-xs font-medium text-muted-foreground">
            Department
          </span>
          <div role="group" aria-labelledby={groupLabelId} className="flex flex-wrap gap-2">
            <DepartmentChip
              isSelected={department === null}
              onClick={() => onDepartmentChange(null)}
            >
              All departments
            </DepartmentChip>

            {departments.map((name) => (
              <DepartmentChip
                key={name}
                isSelected={department === name}
                onClick={() => onDepartmentChange(department === name ? null : name)}
              >
                {name}
              </DepartmentChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One filter chip.
 *
 * `aria-pressed` is what conveys selection to a screen reader; the colour
 * change alone would leave the state invisible to anyone not seeing it
 * (Phase 5 §41).
 */
function DepartmentChip({
  isSelected,
  onClick,
  children,
}: {
  readonly isSelected: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
        isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
