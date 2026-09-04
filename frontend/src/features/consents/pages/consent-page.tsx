import {
  ArrowLeft,
  CalendarClock,
  FileCheck2,
  Landmark,
  Lock,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback/error-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { useApplicationConsents, useDecideConsent } from '../hooks/use-consents';
import { consentErrorMessage } from '../utils/consent-error';
import { ConsentStatusBadge } from '../components/consent-status-badge';
import { DenyConsentDialog } from '../components/deny-consent-dialog';
import type { ApplicationConsentPayload, ConsentRequest } from '../types/consent.types';

/**
 * "Review and Grant Consent" — `reference/myapplication.png`.
 *
 * The reference presents the request as a table: what is being accessed, why,
 * who receives it, and the citizen's answer. That structure is kept, because it
 * is what makes the decision legible. Two things in the reference are
 * deliberately not built:
 *
 *   - the tick-boxes are pre-ticked, which would let a citizen "Allow and
 *     Continue" without ever choosing. Consent has to be an explicit act
 *     (Phase 7 §10), so each row carries its own Allow / Deny instead;
 *   - "Deny and Pause Application" implies a workflow state Phase 7 does not
 *     own. Denial is recorded; the application is not moved (Phase 7 §17, §31).
 */
export function ConsentPage() {
  const { applicationId = '' } = useParams<{ applicationId: string }>();
  const consents = useApplicationConsents(applicationId);

  if (consents.isPending) return <Skeleton className="mx-auto h-[34rem] max-w-5xl rounded-2xl" />;
  if (consents.isError || !consents.data) {
    return (
      <div className="mx-auto max-w-5xl">
        <ErrorState
          title="Could not load consent request"
          description={consentErrorMessage(consents.error)}
          onRetry={() => void consents.refetch()}
        />
      </div>
    );
  }
  return <ConsentReview applicationId={applicationId} payload={consents.data} />;
}

function ConsentReview({
  applicationId,
  payload,
}: {
  readonly applicationId: string;
  readonly payload: ApplicationConsentPayload;
}) {
  const decide = useDecideConsent(applicationId);
  const [pendingDenial, setPendingDenial] = useState<ConsentRequest | null>(null);
  const { application, consents } = payload;

  const submitDecision = (consentId: string, granted: boolean) => {
    if (decide.isPending) return;
    decide.mutate({ consentId, granted });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <Link
          to={`/citizen/applications/${applicationId}`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to application
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Review and grant consent
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {application.applicationNumber} · {application.serviceName}
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        {/* The application this request belongs to, so consent is never granted
            against an unnamed context. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-5 sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
            <Landmark className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{application.applicationNumber}</p>
            <p className="text-sm text-muted-foreground">{application.serviceName}</p>
          </div>
        </div>

        <section aria-labelledby="consent-question" className="border-b border-border p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
              <ShieldQuestion className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="consent-question" className="text-lg font-semibold sm:text-xl">
                Allow SetuX to request the information needed to verify your application?
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                SetuX will only request the information listed below, only from the sources named,
                and only to process this application with the{' '}
                <span className="font-medium text-foreground">{application.recipient}</span>. Nothing
                is requested until you allow it.
              </p>
            </div>
          </div>
        </section>

        {consents.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              title="No consent needed"
              description="This application does not require any information from another government system. You provided everything it needs yourself."
            />
          </div>
        ) : (
          <>
            <ConsentTable
              consents={consents}
              recipient={application.recipient}
              isDeciding={decide.isPending}
              onGrant={(consent) => submitDecision(consent.id, true)}
              onDeny={setPendingDenial}
            />

            <section
              aria-labelledby="consent-terms"
              className="grid gap-5 border-t border-border p-5 sm:grid-cols-2 sm:p-6"
            >
              <h2 id="consent-terms" className="sr-only">
                How your consent is used
              </h2>
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="font-semibold">What allowing does</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    It authorizes SetuX to request that one item, from that one source, for this
                    application only. It is not permission for anything else.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="font-semibold">What denying does</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    That information will not be requested. Your application is not withdrawn, but
                    it cannot be verified without it.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {decide.isError && (
          <p role="alert" className="border-t border-border px-5 py-4 text-sm text-destructive sm:px-6">
            {consentErrorMessage(decide.error)}
          </p>
        )}
      </div>

      {consents.length > 0 && !payload.isDecisionRequired && (
        <Alert>
          <FileCheck2 aria-hidden />
          <AlertDescription>
            You have responded to every request. SetuX will not retrieve any information you did not
            allow. Verification with the government systems begins in a later SetuX step.
          </AlertDescription>
        </Alert>
      )}

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        Your decision is recorded against this application and can be reviewed here at any time.
      </p>

      <DenyConsentDialog
        consent={pendingDenial}
        isPending={decide.isPending}
        onCancel={() => setPendingDenial(null)}
        onConfirm={(consent) => {
          setPendingDenial(null);
          submitDecision(consent.id, false);
        }}
      />
    </div>
  );
}

/**
 * The requested items.
 *
 * A real `<table>` on wide screens, because this is tabular data and the column
 * headers are what make each cell meaningful to a screen reader. Below `md` the
 * same rows are re-laid out as stacked cards: five columns cannot be read on a
 * 360px screen without horizontal scrolling, and the actions have to stay
 * reachable (Phase 7 §35).
 */
function ConsentTable({
  consents,
  recipient,
  isDeciding,
  onGrant,
  onDeny,
}: {
  readonly consents: readonly ConsentRequest[];
  readonly recipient: string;
  readonly isDeciding: boolean;
  readonly onGrant: (consent: ConsentRequest) => void;
  readonly onDeny: (consent: ConsentRequest) => void;
}) {
  return (
    <section aria-labelledby="requested-information">
      <h2 id="requested-information" className="sr-only">
        Information SetuX is requesting
      </h2>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-6 py-3">Information</th>
              <th scope="col" className="px-4 py-3">Purpose</th>
              <th scope="col" className="px-4 py-3">Recipient</th>
              <th scope="col" className="px-4 py-3">Your consent</th>
            </tr>
          </thead>
          <tbody>
            {consents.map((consent) => (
              <tr key={consent.id} className="border-b border-border last:border-b-0 align-top">
                <th scope="row" className="px-6 py-4 font-medium">
                  {consent.information}
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {consent.source}
                  </span>
                </th>
                <td className="px-4 py-4 text-muted-foreground">{consent.purpose}</td>
                <td className="px-4 py-4 text-muted-foreground">{recipient}</td>
                <td className="px-4 py-4">
                  <ConsentDecision
                    consent={consent}
                    isDeciding={isDeciding}
                    onGrant={onGrant}
                    onDeny={onDeny}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {consents.map((consent) => (
          <li key={consent.id} className="grid gap-3 p-5">
            <div>
              <h3 className="font-medium">{consent.information}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{consent.source}</p>
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Purpose</dt>
                <dd>{consent.purpose}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recipient</dt>
                <dd>{recipient}</dd>
              </div>
            </dl>
            <ConsentDecision
              consent={consent}
              isDeciding={isDeciding}
              onGrant={onGrant}
              onDeny={onDeny}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A pending consent offers both answers; a decided one shows the answer and
 * offers neither.
 *
 * Allow and Deny are equally prominent and equally easy to reach. Allow carries
 * the filled style because it is the affirmative action, not because it is the
 * one being encouraged — Deny is a full button beside it, never a muted link
 * (Phase 7 §27).
 */
function ConsentDecision({
  consent,
  isDeciding,
  onGrant,
  onDeny,
}: {
  readonly consent: ConsentRequest;
  readonly isDeciding: boolean;
  readonly onGrant: (consent: ConsentRequest) => void;
  readonly onDeny: (consent: ConsentRequest) => void;
}) {
  if (consent.status !== 'PENDING') {
    return (
      <div className="grid gap-1">
        <ConsentStatusBadge status={consent.status} />
        {consent.decidedAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(consent.decidedAt).toLocaleString()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        disabled={isDeciding}
        onClick={() => onGrant(consent)}
      >
        Allow
        <span className="sr-only"> access to {consent.information}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isDeciding}
        onClick={() => onDeny(consent)}
      >
        Deny
        <span className="sr-only"> access to {consent.information}</span>
      </Button>
    </div>
  );
}
