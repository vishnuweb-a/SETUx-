import { ArrowLeft, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingState } from '@/components/feedback/loading-state';
import { useReviewDetail, useSubmitDecision } from '../hooks/use-review';
import type { ReviewDecision, ReviewDetailPayload } from '../types/government.types';
import { governmentErrorMessage } from '../utils/government-error';
import { DecisionDialog } from '../components/decision-dialog';
import { OfficerStatusBadge } from '../components/officer-status-badge';
import { OfficerVerificationBadge } from '../components/officer-verification-badge';

/**
 * One application, everything the officer needs to decide it.
 *
 * Laid out as `reference/review.png` lays out its detail panel: the application
 * and its applicant first, then what SetuX checked, then the evidence those
 * checks were made against, and the decision last — the officer reads before
 * they act.
 *
 * What is deliberately absent: raw provider payloads and JSON. Every value on
 * this page is a labelled field from SetuX's own normalized store, attributed
 * to the system that supplied it (§12).
 */
export function ReviewDetailPage() {
  const { applicationId = '' } = useParams();
  const { data, isPending, isError, error, refetch } = useReviewDetail(applicationId);

  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);
  const decisionMutation = useSubmitDecision(applicationId);

  if (isPending) return <LoadingState label="Loading application…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <BackLink />
        <ErrorState
          title="Could not load this application"
          description={governmentErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const handleConfirm = (remarks: string): void => {
    if (pendingDecision === null) return;

    decisionMutation.mutate(
      {
        decision: pendingDecision,
        // Omitted rather than sent empty when there is nothing to say: the
        // backend's schema takes an absent field, not a blank string.
        ...(remarks.length > 0 ? { remarks } : {}),
      },
      { onSuccess: () => setPendingDecision(null) },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.applicationNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {data.service.name} · {data.service.department}
          </p>
        </div>
        <OfficerStatusBadge status={data.status} />
      </header>

      {data.review !== null && <DecisionSummary review={data.review} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <VerificationSection data={data} />
          <EvidenceSection data={data} />
          {Object.keys(data.declaredFields).length > 0 && <DeclaredSection data={data} />}
        </div>

        <div className="space-y-6">
          <ApplicantCard data={data} />
          {data.canDecide && (
            <DecisionCard
              onApprove={() => setPendingDecision('APPROVED')}
              onReject={() => setPendingDecision('REJECTED')}
            />
          )}
        </div>
      </div>

      <DecisionDialog
        decision={pendingDecision}
        applicationNumber={data.applicationNumber}
        isPending={decisionMutation.isPending}
        errorMessage={
          decisionMutation.isError ? governmentErrorMessage(decisionMutation.error) : null
        }
        onConfirm={handleConfirm}
        onOpenChange={(open) => {
          if (!open && !decisionMutation.isPending) {
            setPendingDecision(null);
            decisionMutation.reset();
          }
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/government/applications">
        <ArrowLeft className="size-4" aria-hidden />
        Back to applications
      </Link>
    </Button>
  );
}

/**
 * The decision, once one exists.
 *
 * Shown above everything else, because on a finalized application it is the
 * most important fact on the page. The decision controls are gone entirely —
 * not merely disabled — since there is no action left to take (§15).
 */
function DecisionSummary({ review }: { readonly review: NonNullable<ReviewDetailPayload['review']> }) {
  const isApproved = review.decision === 'APPROVED';

  return (
    <Card className={isApproved ? 'border-success/40' : 'border-destructive/40'}>
      <CardContent className="flex flex-wrap items-start gap-4 py-5">
        <span
          className={
            isApproved
              ? 'grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success'
              : 'grid size-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive'
          }
          aria-hidden
        >
          {isApproved ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">
            {isApproved ? 'Approved' : 'Rejected'}
            {review.reviewerName !== null && (
              <span className="font-normal text-muted-foreground"> by {review.reviewerName}</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{formatDateTime(review.reviewedAt)}</p>
          {review.remarks !== null && (
            <p className="pt-1 text-sm whitespace-pre-wrap">{review.remarks}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** What SetuX checked, and what it concluded. */
function VerificationSection({ data }: { readonly data: ReviewDetailPayload }) {
  const { verified, total } = data.verificationSummary;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Verification results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.verifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            SetuX has not verified this application yet.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {verified} of {total} checks verified by SetuX.
            </p>

            <ul className="divide-y divide-border">
              {data.verifications.map((verification) => (
                <li
                  key={verification.requirementCode}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{verification.information}</p>
                    {!verification.required && (
                      <p className="text-xs text-muted-foreground">Optional</p>
                    )}
                  </div>
                  <OfficerVerificationBadge status={verification.status} />
                </li>
              ))}
            </ul>

            {/* The point of the whole phase, said once, where the officer is
                about to act on it. */}
            <p className="text-xs text-muted-foreground">
              These results inform your decision. SetuX does not approve or reject applications.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The retrieved records, grouped by the system that issued them. */
function EvidenceSection({ data }: { readonly data: ReviewDetailPayload }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrieved records</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No records have been retrieved for this application.
          </p>
        ) : (
          data.evidence.map((group, index) => (
            <div key={group.sourceName} className="space-y-3">
              {index > 0 && <Separator />}
              {/* Provenance is the claim SetuX is making — this value came from
                  that government system, not from a form. Naming the source
                  above its values is what makes the federation visible. */}
              <p className="text-sm font-semibold">{group.sourceName}</p>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {group.items.map((item) => (
                  <div key={item.fieldCode} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="text-sm break-words">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** What the applicant themselves stated on the form. */
function DeclaredSection({ data }: { readonly data: ReviewDetailPayload }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Declared by the applicant</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {Object.entries(data.declaredFields).map(([fieldCode, value]) => (
            <div key={fieldCode} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{humanize(fieldCode)}</dt>
              <dd className="text-sm break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ApplicantCard({ data }: { readonly data: ReviewDetailPayload }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Applicant</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <Field label="Name" value={data.applicant.fullName} />
          <Field label="Government ID" value={data.applicant.governmentId} />
          <Field label="Mobile" value={data.applicant.mobileNumber} />
          <Field label="Date of birth" value={formatDate(data.applicant.dateOfBirth)} />
          <Field label="Submitted" value={formatDateTime(data.submittedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

/**
 * The decision controls.
 *
 * Rendered only when the SERVER says a decision is still open. Approve and
 * Reject are given equal weight — neither is the default, because SetuX has no
 * opinion about which one is correct.
 */
function DecisionCard({
  onApprove,
  onReject,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Record your decision on this application. It cannot be undone.
        </p>
        <Button className="w-full" onClick={onApprove}>
          <CheckCircle2 className="size-4" aria-hidden />
          Approve
        </Button>
        <Button variant="destructive" className="w-full" onClick={onReject}>
          <XCircle className="size-4" aria-hidden />
          Reject
        </Button>
      </CardContent>
    </Card>
  );
}

const humanize = (fieldCode: string): string =>
  fieldCode
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .trim();

const formatDate = (value: string | null): string =>
  value === null
    ? '—'
    : new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

const formatDateTime = (value: string | null): string =>
  value === null
    ? '—'
    : new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
