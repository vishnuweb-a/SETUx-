import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  GraduationCap,
  IdCard,
  ReceiptText,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { CitizenRecordSummary, RecordType } from '../types/change-details.types';
import {
  authorityLabel,
  formatDate,
  recordTypeDescription,
  recordTypeLabel,
  sourceLabel,
} from '../utils/record-presentation';
import { RecordStatusBadge } from './record-status-badge';

/**
 * One government record in the chooser.
 *
 * The whole card is the link rather than a trailing button: it is a single
 * destination, and a 44px-plus target is what makes the list usable on a phone.
 */

const RECORD_TYPE_ICONS: Readonly<Record<RecordType, ComponentType<{ className?: string }>>> = {
  IDENTITY_RECORD: IdCard,
  INCOME_RECORD: ReceiptText,
  EDUCATION_RECORD: GraduationCap,
  COMMUNITY_RECORD: Users,
  BANK_DETAILS: Banknote,
};

export function RecordCard({ record }: { readonly record: CitizenRecordSummary }) {
  const Icon = RECORD_TYPE_ICONS[record.recordType] ?? BadgeCheck;
  const title = recordTypeLabel(record.recordType);

  return (
    <li>
      <Link
        to={`/citizen/change-details/${record.id}`}
        className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {recordTypeDescription(record.recordType)}
            </p>
          </div>

          <ArrowRight
            className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RecordStatusBadge status={record.status} />
          {record.isSimulated && <Badge variant="outline">Simulated</Badge>}
        </div>

        {/* A definition list, because each row genuinely is a term and its
            value — and it lets a screen reader announce the pairing. */}
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Source</dt>
            <dd className="truncate">{sourceLabel(record.source, record.isSimulated)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Responsible authority</dt>
            <dd className="truncate">{authorityLabel(record.authority)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Reference</dt>
            <dd className="truncate font-mono text-xs">{record.sourceRecordRef}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Last synced</dt>
            <dd className="truncate">{formatDate(record.lastSyncedAt)}</dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}
