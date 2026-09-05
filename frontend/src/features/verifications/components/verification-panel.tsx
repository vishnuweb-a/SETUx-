import { BadgeCheck, Info, ShieldQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback/error-state';
import { useApplicationVerification, useStartVerification } from '../hooks/use-verification';
import { verificationErrorMessage } from '../utils/verification-error';
import { VerificationStatusBadge } from './verification-status-badge';
import type {
  ApplicationVerificationPayload,
  VerificationItem,
  VerificationReason,
} from '../types/verification.types';

/**
 * "Verification overview" — the Phase 10 surface on a submitted application.
 *
 * It sits directly below the retrieval panel because that is the order the work
 * happens in and the position `reference/dashboard.png` gives it. The two
 * panels say deliberately different things: retrieval says SetuX *has* the
 * document, verification says SetuX has *checked* it against a rule. Collapsing
 * that distinction — relabelling retrieved evidence as verified — is the single
 * thing this phase exists to prevent (§27).
 */
export function VerificationPanel({ applicationId }: { readonly applicationId: string }) {
  const verification = useApplicationVerification(applicationId);
  const start = useStartVerification(applicationId);

  if (verification.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (verification.isError || !verification.data) {
    return (
      <ErrorState
        title="Could not load verification"
        description={verificationErrorMessage(verification.error)}
        onRetry={() => void verification.refetch()}
      />
    );
  }

  const payload = verification.data;
  if (payload.items.length === 0) return null;

  return (
    <section
      aria-labelledby="verification-overview"
      className="rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3 border-b border-border p-5 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <BadgeCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="verification-overview" className="text-lg font-semibold">
            Verification overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SetuX checks the information it fetched against this scholarship&apos;s rules. An
            officer reviews the result before any decision is made.
          </p>
        </div>
      </div>

      <VerificationLead
        applicationId={applicationId}
        payload={payload}
        isStarting={start.isPending}
        error={start.error}
        onStart={() => start.mutate()}
      />

      <ul className="divide-y divide-border">
        {payload.items.map((item) => (
          <VerificationRow key={item.requirementCode} item={item} />
        ))}
      </ul>

      <p className="flex items-start gap-2 border-t border-border p-5 text-xs text-muted-foreground sm:p-6">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {/* The boundary, stated plainly to the citizen. A completed check is not
            an approved application, and the citizen must not read it as one
            (§23). */}
        These checks are automatic. They are not a decision on your application — a government
        officer reviews your application and its checks before deciding.
      </p>
    </section>
  );
}

/**
 * What the citizen can do right now, driven entirely by server-derived
 * readiness.
 *
 * Nothing here is computed from the items: the client never decides that
 * evidence is complete, because that is exactly the judgement the server makes
 * and the browser must not second-guess (§16).
 */
function VerificationLead({
  applicationId,
  payload,
  isStarting,
  error,
  onStart,
}: {
  readonly applicationId: string;
  readonly payload: ApplicationVerificationPayload;
  readonly isStarting: boolean;
  readonly error: unknown;
  readonly onStart: () => void;
}) {
  const { readiness, verifiedCount, totalCount } = payload;

  return (
    <div className="grid gap-3 border-b border-border p-5 sm:p-6">
      {readiness === 'ALREADY_STARTED' && (
        <VerificationProgress verifiedCount={verifiedCount} totalCount={totalCount} />
      )}

      {readiness === 'EVIDENCE_INCOMPLETE' && (
        <Alert>
          <ShieldQuestion aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              SetuX still needs some of your information before it can run these checks. Fetch the
              remaining documents above to continue.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to={`/citizen/applications/${applicationId}/consent`}>Review consent</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {readiness === 'NOT_SUBMITTED' && (
        <p className="text-sm text-muted-foreground">
          Checks begin once your application has been submitted.
        </p>
      )}

      {/* role="alert" so a failure is announced, not only shown (§32). */}
      {error != null && (
        <p role="alert" className="text-sm text-destructive">
          {verificationErrorMessage(error)}
        </p>
      )}

      {readiness === 'READY' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            SetuX has everything it needs. Running the checks takes a moment.
          </p>
          <Button
            type="button"
            onClick={onStart}
            disabled={isStarting}
            // aria-busy communicates the pending state to assistive technology,
            // which a disabled button and a changed label alone do not. The
            // label reflects the real request duration — there is no fabricated
            // progress here, because the run is synchronous (§19).
            aria-busy={isStarting}
          >
            {isStarting ? 'Checking your information…' : 'Start verification'}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * How much of the check is done.
 *
 * Derived from real stored outcomes, never a hard-coded percentage and never an
 * animation standing in for progress (§26). The denominator is every
 * requirement the service asks for, so a requirement SetuX could not judge
 * stays visible as unfinished rather than being quietly dropped from the total
 * to make the bar look complete.
 */
function VerificationProgress({
  verifiedCount,
  totalCount,
}: {
  readonly verifiedCount: number;
  readonly totalCount: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Verification in progress</p>
        <p className="text-sm text-muted-foreground">
          {verifiedCount} of {totalCount} checks passed
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-valuenow={verifiedCount}
        aria-label="Requirements verified"
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-success transition-[width]"
          style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : '0%' }}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Your application is with SetuX for checking. A government officer reviews it next.
      </p>
    </div>
  );
}

/**
 * The citizen-facing explanation for each outcome.
 *
 * Every line avoids stating an eligibility conclusion. RULE_MISMATCH is the one
 * genuine negative finding and is still phrased as something an officer will
 * look at, not as a refusal (§24).
 */
const REASON_TEXT = {
  RULE_MATCH: 'This matched the records held by the issuing department.',
  RULE_MISMATCH:
    'This did not match the records held by the issuing department. An officer will look at it.',
  EVIDENCE_MISSING: 'SetuX does not have this information yet, so it could not be checked.',
  EVIDENCE_UNREADABLE: 'This information could not be read in the expected format.',
  NO_RULE_DEFINED:
    'SetuX has this information but no automatic rule for it, so an officer will review it.',
} as const satisfies Record<VerificationReason, string>;

function VerificationRow({ item }: { readonly item: VerificationItem }) {
  return (
    <li className="grid gap-2 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{item.information}</h3>
          {!item.required && <p className="mt-0.5 text-xs text-muted-foreground">Optional</p>}
        </div>
        <VerificationStatusBadge status={item.status} />
      </div>

      {item.reasonCode && (
        <p className="text-sm text-muted-foreground">{REASON_TEXT[item.reasonCode]}</p>
      )}

      {item.status === null && (
        <p className="text-sm text-muted-foreground">This has not been checked yet.</p>
      )}

      {item.verifiedAt && (
        <p className="text-xs text-muted-foreground">
          Checked {new Date(item.verifiedAt).toLocaleString()}
        </p>
      )}
    </li>
  );
}
