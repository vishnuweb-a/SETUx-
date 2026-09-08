import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCitizenRecord } from '../hooks/use-citizen-records';
import { useFieldSelection } from '../hooks/use-field-selection';
import { RecordFieldRow } from '../components/record-field-row';
import { RecordStatusBadge } from '../components/record-status-badge';
import { changeDetailsErrorMessage, isRecordNotFound } from '../utils/change-details-error';
import type { CitizenRecordDetail } from '../types/change-details.types';
import {
  authorityLabel,
  formatDate,
  recordStatusDescription,
  recordTypeLabel,
  selectableFields,
  sourceLabel,
} from '../utils/record-presentation';

/**
 * One record, its fields, and which of them the citizen wants to correct.
 *
 * The screen ends at a selection. It sends nothing: no proposed value is
 * collected, no request is created, and no mutating call is made — the next
 * phase owns the edit form and the draft it writes.
 *
 * The selection travels in router state rather than the URL. Field keys in a
 * query string would be a durable, shareable record of which of their details a
 * citizen considers wrong, logged by every proxy in between, for a value that
 * is meaningful for one navigation.
 */
export function ChangeDetailsRecordPage() {
  const { recordId = '' } = useParams<{ recordId: string }>();
  const record = useCitizenRecord(recordId);
  const selection = useFieldSelection();
  const navigate = useNavigate();

  if (record.isPending) return <RecordSkeleton />;

  if (record.isError) {
    return (
      <PageShell>
        {isRecordNotFound(record.error) ? (
          <EmptyState
            title="Record not found"
            description="This record could not be found in your account. It may have been removed, or the link may be incorrect."
            action={
              <Button asChild size="sm" className="mt-2">
                <Link to="/citizen/change-details">Back to your records</Link>
              </Button>
            }
            className="bg-card"
          />
        ) : (
          <ErrorState
            title="Could not load this record"
            description={changeDetailsErrorMessage(record.error)}
            onRetry={() => void record.refetch()}
          />
        )}
      </PageShell>
    );
  }

  const detail = record.data;
  const changeableCount = selectableFields(detail.fields).length;

  const handleContinue = (): void => {
    navigate(`/citizen/change-details/${detail.id}/fields`, {
      state: { recordId: detail.id, selectedFieldKeys: selection.selectedKeys },
    });
  };

  return (
    <PageShell recordTitle={recordTypeLabel(detail.recordType)}>
      <RecordSummary detail={detail} />

      <section aria-labelledby="choose-fields-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="choose-fields-heading" className="text-lg font-semibold tracking-tight">
            Choose fields to update
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select every detail you want corrected. Locked details are shown so you can see the
            whole record, and cannot be selected.
          </p>
        </div>

        {detail.fields.length === 0 ? (
          <EmptyState
            title="No details available"
            description="SetuX has not read any details for this record yet."
            className="bg-card"
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {detail.fields.map((field) => (
              <RecordFieldRow
                key={field.fieldKey}
                field={field}
                isSelected={selection.isSelected(field.fieldKey)}
                onToggle={selection.toggle}
              />
            ))}
          </ul>
        )}

        {detail.fields.length > 0 && changeableCount === 0 && (
          <p className="text-sm text-muted-foreground">
            None of the details on this record can be corrected through SetuX. Contact{' '}
            {authorityLabel(detail.authority)} to request a change.
          </p>
        )}
      </section>

      <ContinueBar
        selectedCount={selection.selectedCount}
        canContinue={selection.hasSelection}
        onContinue={handleContinue}
      />
    </PageShell>
  );
}

/**
 * The page frame: breadcrumb, heading, and the content beneath it.
 *
 * Shared by the loaded, failed and not-found states so a citizen who follows a
 * broken link still gets the breadcrumb that takes them back.
 */
function PageShell({
  recordTitle,
  children,
}: {
  readonly recordTitle?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-28">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link
              to="/citizen/change-details"
              className="rounded hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Change Details
            </Link>
          </li>
          {recordTitle !== undefined && (
            <>
              <li aria-hidden>
                <ChevronRight className="size-4" />
              </li>
              <li aria-current="page" className="font-medium text-foreground">
                {recordTitle}
              </li>
            </>
          )}
        </ol>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {recordTitle ?? 'Record details'}
      </h1>

      {children}
    </div>
  );
}

/** Where the record comes from, who owns it, and how current SetuX believes it is. */
function RecordSummary({ detail }: { readonly detail: CitizenRecordDetail }) {
  return (
    <section
      aria-label="Record summary"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <RecordStatusBadge status={detail.status} />
        {detail.isSimulated && <Badge variant="outline">Simulated</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">{recordStatusDescription(detail.status)}</p>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Source</dt>
          <dd className="break-words">{sourceLabel(detail.source, detail.isSimulated)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Responsible authority</dt>
          <dd className="break-words">{authorityLabel(detail.authority)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Reference</dt>
          <dd className="font-mono text-xs break-all">{detail.sourceRecordRef}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Last synced</dt>
          <dd>{formatDate(detail.lastSyncedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The action bar.
 *
 * Fixed to the foot of the viewport so it stays reachable on a phone, where the
 * field list is longer than the screen. The count is a live region: ticking a
 * checkbox far up the list must be confirmed to a screen-reader user who cannot
 * see the bar change.
 */
function ContinueBar({
  selectedCount,
  canContinue,
  onContinue,
}: {
  readonly selectedCount: number;
  readonly canContinue: boolean;
  readonly onContinue: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {selectedCount === 0
            ? 'No fields selected'
            : `${selectedCount} ${selectedCount === 1 ? 'field' : 'fields'} selected`}
        </p>

        <Button onClick={onContinue} disabled={!canContinue}>
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function RecordSkeleton() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex max-w-4xl flex-col gap-6">
      <span className="sr-only">Loading record…</span>
      <Skeleton className="h-8 w-64" aria-hidden />
      <Skeleton className="h-40 w-full rounded-2xl" aria-hidden />
      <Skeleton className="h-96 w-full rounded-2xl" aria-hidden />
    </div>
  );
}
