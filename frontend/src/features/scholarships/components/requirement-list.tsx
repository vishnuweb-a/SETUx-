import { FileText, IdCard, Landmark, PenLine } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge } from '@/components/ui/badge';
import type { RequirementType, ScholarshipRequirement } from '../types/scholarship.types';

/**
 * Glyph per requirement kind.
 *
 * Keyed by the database's `requirement_type` check constraint, so a type the
 * schema allows always has an icon. Lucide throughout — the icon set the rest
 * of SetuX already uses (Phase 5 §42).
 */
const REQUIREMENT_ICONS: Record<RequirementType, ComponentType<{ className?: string }>> = {
  IDENTITY: IdCard,
  DOCUMENT: FileText,
  RECORD: Landmark,
  DECLARATION: PenLine,
};

/**
 * What a scholarship requires, rendered from `service_requirements`.
 *
 * Every row here is database data — the names, the descriptions, the order and
 * which government system supplies each one. None of it is written into this
 * component, which is what keeps the screen and the workflow's actual
 * configuration from drifting apart (Phase 5 §27).
 */
export function RequirementList({
  requirements,
}: {
  readonly requirements: readonly ScholarshipRequirement[];
}) {
  if (requirements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This scholarship has no additional requirements recorded.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {requirements.map((requirement) => {
        const Icon = REQUIREMENT_ICONS[requirement.type] ?? FileText;

        return (
          <li
            key={requirement.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary"
              aria-hidden
            >
              <Icon className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{requirement.name}</p>
                {/* "Optional" is the marked case: most requirements are
                    mandatory, so badging every one of those would be noise. */}
                {!requirement.required && (
                  <Badge variant="outline" className="font-normal">
                    Optional
                  </Badge>
                )}
              </div>

              {requirement.description !== null && (
                <p className="mt-1 text-sm text-muted-foreground">{requirement.description}</p>
              )}

              {/* Naming the source is the point of this screen: it tells the
                  citizen which department SetuX will approach on their behalf,
                  before any consent is asked for. */}
              {requirement.source !== null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Retrieved from <span className="font-medium">{requirement.source}</span>
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
