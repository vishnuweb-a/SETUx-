import { FileText, Info, Landmark, ShieldQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback/error-state';
import { useApplicationRetrievals, useCreateRetrieval } from '../hooks/use-retrievals';
import { retrievalErrorMessage } from '../utils/retrieval-error';
import { RetrievalStatusBadge } from './retrieval-status-badge';
import type { RetrievalItem } from '../types/retrieval.types';

/**
 * "Documents from government systems" — the Phase 8 surface on a submitted
 * application.
 *
 * It lives on the application rather than on its own page because retrieval is
 * something that happens *to* an application, and the citizen has just come
 * from consenting on the page next door. `reference/dashboard.png` shows a
 * "Verification Overview" in this position; that is deliberately not what this
 * is. This panel says "Retrieved", never "Verified" — SetuX has fetched the
 * document and has not yet checked it (Phase 8 §32, §49).
 */
export function RetrievalPanel({ applicationId }: { readonly applicationId: string }) {
  const retrievals = useApplicationRetrievals(applicationId);
  const create = useCreateRetrieval(applicationId);

  if (retrievals.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (retrievals.isError || !retrievals.data) {
    return (
      <ErrorState
        title="Could not load your documents"
        description={retrievalErrorMessage(retrievals.error)}
        onRetry={() => void retrievals.refetch()}
      />
    );
  }

  const { items } = retrievals.data;
  if (items.length === 0) return null;

  const awaitingConsent = items.some((item) => item.availability === 'CONSENT_REQUIRED');

  return (
    <section
      aria-labelledby="retrieved-documents"
      className="rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3 border-b border-border p-5 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="retrieved-documents" className="text-lg font-semibold">
            Documents from government systems
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SetuX fetches these on your behalf from the systems that issued them, using only the
            consent you have given.
          </p>
        </div>
      </div>

      {awaitingConsent && (
        <div className="border-b border-border p-5 sm:p-6">
          <Alert>
            <ShieldQuestion aria-hidden />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Some of these need your consent before SetuX can request them.</span>
              <Button asChild size="sm">
                <Link to={`/citizen/applications/${applicationId}/consent`}>Review consent</Link>
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <RetrievalRow
            key={item.requirementId}
            item={item}
            applicationId={applicationId}
            isBusy={create.isPending}
            pendingId={create.isPending ? create.variables : null}
            error={create.variables === item.requirementId ? create.error : null}
            onFetch={() => create.mutate(item.requirementId)}
          />
        ))}
      </ul>

      <p className="flex items-start gap-2 border-t border-border p-5 text-xs text-muted-foreground sm:p-6">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {/* The prototype must never be mistaken for a live government
            integration (Phase 8 §29, government-connector.md §32). */}
        These are simulated government systems holding synthetic demonstration data. Retrieved
        documents have not yet been checked against the scholarship's rules.
      </p>
    </section>
  );
}

function RetrievalRow({
  item,
  applicationId,
  isBusy,
  pendingId,
  error,
  onFetch,
}: {
  readonly item: RetrievalItem;
  readonly applicationId: string;
  readonly isBusy: boolean;
  readonly pendingId: string | null;
  readonly error: unknown;
  readonly onFetch: () => void;
}) {
  const isFetching = pendingId === item.requirementId;
  const canFetch = item.availability === 'AVAILABLE' || item.availability === 'RETRYABLE';

  return (
    <li className="grid gap-3 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{item.information}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.source}
            {item.isSimulated && ' · Simulated'}
          </p>
        </div>
        <RetrievalStatusBadge availability={item.availability} />
      </div>

      {item.availability === 'COMPLETED' && <RetrievedDetails item={item} />}

      {item.availability === 'CONSENT_DENIED' && (
        <p className="text-sm text-muted-foreground">
          You denied consent for this, so SetuX will not request it.
        </p>
      )}

      {item.availability === 'CONSENT_REQUIRED' && (
        <p className="text-sm text-muted-foreground">
          Waiting for your decision on the{' '}
          <Link
            to={`/citizen/applications/${applicationId}/consent`}
            className="text-primary hover:underline"
          >
            consent page
          </Link>
          .
        </p>
      )}

      {item.availability === 'NOT_SUPPORTED' && (
        <p className="text-sm text-muted-foreground">
          This system is not connected to SetuX yet.
        </p>
      )}

      {/* The stored reason for the last failure, distinct from an error raised
          by the attempt the citizen just made. */}
      {item.availability === 'RETRYABLE' && item.failureReason && (
        <p className="text-sm text-muted-foreground">{item.failureReason}</p>
      )}

      {/* role="alert" so the failure is announced, not only shown
          (Phase 8 §44). */}
      {error != null && (
        <p role="alert" className="text-sm text-destructive">
          {retrievalErrorMessage(error)}
        </p>
      )}

      {canFetch && (
        <div>
          <Button
            type="button"
            size="sm"
            // Disabled while any row is fetching, so two providers are never
            // called at once from one page.
            disabled={isBusy}
            // aria-busy communicates the pending state to assistive technology,
            // which a disabled button and a changed label alone do not.
            aria-busy={isFetching}
            onClick={onFetch}
          >
            {isFetching
              ? 'Fetching…'
              : item.availability === 'RETRYABLE'
                ? 'Try again'
                : 'Fetch from ' + item.source}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * What was retrieved.
 *
 * Normalized values only — the provider's own response shape never reaches the
 * browser. Every value shown here came through the server's mapper (Phase 8
 * §32).
 */
function RetrievedDetails({ item }: { readonly item: RetrievalItem }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {item.issuer && (
          <div>
            <dt className="text-xs text-muted-foreground">Issued by</dt>
            <dd className="mt-0.5 font-medium">{item.issuer}</dd>
          </div>
        )}
        {item.retrievedAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Retrieved</dt>
            <dd className="mt-0.5 font-medium">{new Date(item.retrievedAt).toLocaleString()}</dd>
          </div>
        )}
        {item.values.map((value) => (
          <div key={value.label}>
            <dt className="text-xs text-muted-foreground">{value.label}</dt>
            <dd className="mt-0.5 font-medium break-words">{value.value}</dd>
          </div>
        ))}
      </dl>
      {item.providerReference && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" aria-hidden />
          Reference {item.providerReference}
        </p>
      )}
    </div>
  );
}
