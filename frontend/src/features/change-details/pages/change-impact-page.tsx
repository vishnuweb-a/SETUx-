import { ArrowRight, Info } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Button } from '@/components/ui/button';
import { ChangeFormShell, ChangeFormSkeleton } from '../components/change-form-shell';
import { ImpactRecordCard } from '../components/impact-record-card';
import { useChangeImpact } from '../hooks/use-change-impact';
import { changeDraftErrorMessage, isChangeDraftNotFound } from '../utils/change-details-error';
import { fieldLabel, formatFieldValue } from '../utils/record-presentation';
import type { ChangeImpactAnalysis } from '../types/change-impact.types';

/**
 * Which of the citizen's other records this correction affects (Phase 5).
 *
 * Reached from the saved draft, and addressed by the DRAFT's id — so this
 * screen is refresh-safe for the same reason the draft screen is: everything on
 * it comes from the server, nothing from navigation state, and the URL opened
 * tomorrow rebuilds the same analysis.
 *
 * WHAT THIS SCREEN DOES NOT DO, and the omissions are the phase boundary:
 *
 *   - No checkbox, no radio, no toggle. The citizen cannot yet choose which
 *     records to include; target selection is the next stage.
 *   - No "Continue", "Consent" or "Send" action. There is nothing to send to.
 *   - No mutation of any kind. The only network call this page makes is the GET
 *     that produced what it renders.
 *   - Nothing is decided here. The levels, the reasons and the availability are
 *     the server's conclusions, rendered as given.
 *
 * The screen says so explicitly rather than offering a control that would lead
 * nowhere — the same honesty the Phase 4 draft screen chose over a "Continue"
 * button.
 */
export function ChangeImpactPage() {
  const { changeRequestId = '' } = useParams<{ changeRequestId: string }>();
  const impact = useChangeImpact(changeRequestId);

  if (impact.isPending) return <ChangeFormSkeleton />;

  if (impact.isError) {
    return (
      <ImpactShell changeRequestId={changeRequestId} recordId={null}>
        {isChangeDraftNotFound(impact.error) ? (
          // A draft belonging to another citizen produces this same state as one
          // that never existed. The wording must not suggest otherwise.
          <EmptyState
            title="Request not found"
            description="This correction request could not be found in your account. It may have been removed, or the link may be incorrect."
            action={
              <Button asChild size="sm" className="mt-2">
                <Link to="/citizen/change-details">Back to your records</Link>
              </Button>
            }
            className="bg-card"
          />
        ) : (
          <ErrorState
            title="Could not check affected records"
            description={changeDraftErrorMessage(impact.error)}
            onRetry={() => void impact.refetch()}
          />
        )}
      </ImpactShell>
    );
  }

  const analysis = impact.data;

  return (
    <ImpactShell
      changeRequestId={analysis.changeRequestId}
      recordId={analysis.sourceRecord.recordId}
    >
      <RequestedChange analysis={analysis} />

      {analysis.impacts.length === 0 ? (
        <EmptyState
          title="No other linked records were detected"
          // Deliberately worded as what SetuX FOUND, not as a guarantee about
          // the world. This is a prototype over synthetic records, and implying
          // that every government system is synchronised would be the one claim
          // on this page with consequences outside the screen.
          description="No other linked records were detected for this change. Only the record you are correcting appears to hold these details."
          className="bg-card"
        />
      ) : (
        <section aria-labelledby="affected-records-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="affected-records-heading" className="text-lg font-semibold tracking-tight">
              Records that may be affected
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These records appear to hold the same details. Nothing has been sent to any of them.
            </p>
          </div>

          {/* Ordered by the server, strongest first. The list is not re-sorted
              here — the ranking is a product decision the backend already made,
              and a second ordering in the client is a second thing that can
              disagree.

              Labelled by the same heading the section is: a screen reader
              reaching the list directly is told what it lists, rather than
              announcing four items with no context. */}
          <ul aria-labelledby="affected-records-heading" className="grid gap-4">
            {analysis.impacts.map((entry) => (
              <ImpactRecordCard key={entry.recordType} impact={entry} />
            ))}
          </ul>
        </section>
      )}

      <PhaseBoundaryNotice />
    </ImpactShell>
  );
}

/**
 * The frame, reusing the shared change-form shell.
 *
 * The breadcrumb's leaf is "Affected records", and it points back at both the
 * record and the draft — this screen sits between them in the citizen's path,
 * and either is a place they may want to return to.
 */
function ImpactShell({
  changeRequestId,
  recordId,
  children,
}: {
  readonly changeRequestId: string;
  readonly recordId: string | null;
  readonly children: React.ReactNode;
}) {
  return (
    <ChangeFormShell
      heading="Records affected by your correction"
      // Overridden: the form wording asks the citizen to type, and there is
      // nothing on this page to type into. What it keeps is the assurance,
      // which is the part that matters on every screen of this flow.
      subheading="These are the other records that may hold the same details. Nothing has been sent, and your government records are unchanged."
      recordId={recordId}
      breadcrumbLeaf="Affected records"
    >
      {children}

      {changeRequestId !== '' && (
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/citizen/change-details/drafts/${changeRequestId}`}>
              Back to your request
            </Link>
          </Button>
        </div>
      )}
    </ChangeFormShell>
  );
}

/**
 * What the analysis is about.
 *
 * The preview would be incomprehensible without it: four cards explaining
 * consequences, with the change that causes them on a different screen, asks
 * somebody to accept an argument whose premise is off-page.
 *
 * Both values come from the stored draft, so this is the same before/after pair
 * the citizen saw on the form — not a re-read of what the source holds now.
 */
function RequestedChange({ analysis }: { readonly analysis: ChangeImpactAnalysis }) {
  if (analysis.changedFields.length === 0) {
    // Not reachable through the Phase 4 API, which refuses an empty field set.
    // Handled anyway rather than rendering a heading above nothing.
    return (
      <EmptyState
        title="This request has no details yet"
        description="No details are attached to this correction request, so there is nothing to check."
        className="bg-card"
      />
    );
  }

  return (
    <section aria-labelledby="requested-change-heading" className="flex flex-col gap-3">
      <h2 id="requested-change-heading" className="text-lg font-semibold tracking-tight">
        The correction you asked for
      </h2>

      <ul className="grid gap-3">
        {analysis.changedFields.map((field) => (
          <li
            key={field.fieldKey}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-sm font-medium">{fieldLabel(field.fieldKey)}</p>

            {/* Stacks on a phone and sits inline on a wider screen, so the
                arrow never separates two values onto different lines with
                nothing joining them. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground line-through">
                {formatFieldValue(field.oldValue)}
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-medium">{formatFieldValue(field.proposedValue)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Where Phase 5 ends.
 *
 * The honest alternative to a "Continue to consent" button. Choosing targets,
 * granting consent and sending the request to a department are the next stage,
 * and a control that navigated to a route that does not exist — or to a
 * placeholder pretending to be that stage — would misrepresent what SetuX can
 * currently do.
 */
function PhaseBoundaryNotice() {
  return (
    <Alert>
      <Info aria-hidden />
      <AlertTitle>Nothing has been sent yet</AlertTitle>
      <AlertDescription>
        <p>
          This page only shows which records may be affected. Choosing which of them to correct,
          giving consent and sending the request to the responsible department are part of the next
          stage of this service. Your draft is saved and your government records are unchanged.
        </p>
      </AlertDescription>
    </Alert>
  );
}
