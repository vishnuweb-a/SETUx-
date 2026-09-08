import {
  Banknote,
  BadgeCheck,
  Building2,
  CircleOff,
  GraduationCap,
  IdCard,
  ReceiptText,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { RecordType } from '../types/change-details.types';
import type { ChangeImpact } from '../types/change-impact.types';
import { fieldLabel, recordTypeLabel } from '../utils/record-presentation';
import { impactLevelDescription } from '../utils/change-impact-presentation';
import { ImpactLevelBadge } from './impact-level-badge';

/**
 * One affected record on the impact preview (Phase 5).
 *
 * A CARD, NOT A CHOICE. There is no checkbox, no radio, no toggle and no
 * link — deliberately, and it is the constraint that shapes the whole
 * component. Phase 5 detects impact; selecting which records to correct,
 * consenting and sending them to a department are the next stage. A control
 * here would offer the citizen an action that goes nowhere, and a pre-checked
 * one would imply a decision had already been recorded on their behalf.
 *
 * It is therefore a plain `<li>` rather than an interactive element, and it
 * takes no `onSelect`, no `checked` and no `disabled` — there is no prop
 * through which selection could be threaded in without rewriting the file,
 * which is the point.
 *
 * WHAT THE CARD MUST CONVEY, in this order:
 *   1. Which record.
 *   2. How strongly it is affected — badge, with an icon as well as colour.
 *   3. WHY, in the words the rule itself carries.
 *   4. Who is responsible for it, when anybody is.
 *   5. Whether SetuX can actually reach it.
 */

const RECORD_TYPE_ICONS: Readonly<Record<RecordType, ComponentType<{ className?: string }>>> = {
  IDENTITY_RECORD: IdCard,
  INCOME_RECORD: ReceiptText,
  EDUCATION_RECORD: GraduationCap,
  COMMUNITY_RECORD: Users,
  BANK_DETAILS: Banknote,
};

export function ImpactRecordCard({ impact }: { readonly impact: ChangeImpact }) {
  const Icon = RECORD_TYPE_ICONS[impact.recordType] ?? BadgeCheck;

  return (
    <li
      // `items-start` and `min-w-0` on the text column are what keep a long
      // reason wrapping inside the card instead of forcing the page to scroll
      // sideways on a 360px screen.
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          {/* The heading and the badge share a row on a wide screen and stack
              on a narrow one, so the badge is never clipped and never pushes
              the record name out of view. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-semibold tracking-tight">{recordTypeLabel(impact.recordType)}</h3>
            <ImpactLevelBadge level={impact.impactLevel} />
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {impactLevelDescription(impact.impactLevel)}
          </p>
        </div>
      </div>

      {/* WHY. Every reason the server returned, not just the strongest: a
          record reached by two corrections has two causes, and showing one
          would drop a true statement. Each names the detail it came from, so
          the citizen can attribute it. */}
      <ul className="flex flex-col gap-2 border-t border-border pt-4">
        {impact.reasons.map((reason) => (
          <li key={`${reason.fieldKey}-${reason.reason}`} className="text-sm">
            <span className="font-medium">{fieldLabel(reason.fieldKey)}: </span>
            <span className="text-muted-foreground">{reason.reason}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {impact.responsibleDepartment !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" aria-hidden />
            {impact.responsibleDepartment.name}
          </span>
        ) : (
          // The bank has no officer queue and never will. Saying so is more
          // honest than an empty space that reads as missing data.
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" aria-hidden />
            Held outside government systems
          </span>
        )}

        {!impact.available && (
          // Stated plainly rather than by greying the card out. A record SetuX
          // cannot reach is still a real consequence of the change, and a
          // REQUIRED one that cannot be reached is the most important thing on
          // the page — dimming it would bury exactly that.
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <CircleOff className="size-3.5" aria-hidden />
            Not linked to your SetuX account
          </span>
        )}
      </div>
    </li>
  );
}
