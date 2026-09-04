import { ArrowRight, Building2, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { ScholarshipSummary } from '../types/scholarship.types';

/**
 * One catalogue card.
 *
 * Rendered from API data for every entry — there is no per-scholarship markup
 * anywhere in this feature (Phase 5 §31).
 *
 * The whole card is a single `Link`, not a `div` with an `onClick`. That is
 * what makes it reachable by keyboard, announced as a link, and openable in a
 * new tab, and it is why the "View details" affordance is styled text inside
 * the link rather than a nested button — a button inside a link is neither
 * valid nor operable (Phase 5 §41).
 */
export function ScholarshipCard({ scholarship }: { readonly scholarship: ScholarshipSummary }) {
  return (
    <Link
      to={`/citizen/services/${scholarship.id}`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"
          aria-hidden
        >
          <GraduationCap className="size-6" />
        </span>

        <div className="min-w-0 flex-1">
          {/* `text-balance` keeps a long scheme name from breaking to a single
              trailing word, and wrapping is allowed rather than truncated: the
              name is what the citizen is choosing between (Phase 5 §6). */}
          <h3 className="leading-snug font-semibold text-balance">{scholarship.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{scholarship.department}</span>
          </p>
        </div>
      </div>

      {/* Clamped to keep every card in a row the same height while the grid
          stays driven by content rather than a fixed pixel height. */}
      <p className="line-clamp-3 text-sm text-muted-foreground">{scholarship.description}</p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <Badge variant="secondary" className="font-normal">
          Accepting applications
        </Badge>
        <span className="flex items-center gap-1 text-sm font-medium text-primary">
          View details
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
