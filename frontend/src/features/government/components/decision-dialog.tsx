import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ReviewDecision } from '../types/government.types';

/**
 * The confirmation step before a decision is recorded.
 *
 * A decision is irreversible in this phase — there is no route to amend or undo
 * one — so it is never a single click. The dialog states the consequence in
 * plain words, names the application it applies to, and requires a second,
 * deliberate action.
 *
 * A rejection additionally requires a reason. The backend and the database both
 * enforce that too, but collecting it here is what makes the requirement
 * legible rather than a rejected request: the citizen will read this reason, and
 * "rejected" with nothing else is a decision they cannot act on or appeal.
 */
export function DecisionDialog({
  decision,
  applicationNumber,
  isPending,
  errorMessage,
  onConfirm,
  onOpenChange,
}: {
  /** The pending decision, or null when the dialog is closed. */
  readonly decision: ReviewDecision | null;
  readonly applicationNumber: string;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly onConfirm: (remarks: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [remarks, setRemarks] = useState('');
  const remarksId = useId();
  const isRejection = decision === 'REJECTED';

  // Reset the field when the dialog opens on a NEW decision — an officer who
  // cancels an approval and then opens a rejection must not find the previous
  // text waiting for them.
  //
  // Adjusted during render rather than in an effect, the pattern the layouts
  // use for the same shape of problem: the field is already empty on the
  // dialog's first paint, instead of showing stale text for a frame. Clearing
  // on open rather than on close also means a dialog that closes while the
  // request is in flight does not wipe the text still being submitted.
  const [lastDecision, setLastDecision] = useState(decision);

  if (lastDecision !== decision) {
    setLastDecision(decision);
    if (decision !== null) setRemarks('');
  }

  const trimmed = remarks.trim();
  const canSubmit = !isPending && (!isRejection || trimmed.length > 0);

  return (
    <Dialog open={decision !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isRejection ? 'Reject this application?' : 'Approve this application?'}
          </DialogTitle>
          <DialogDescription>
            {isRejection
              ? `${applicationNumber} will be recorded as rejected and the applicant will see your reason. This cannot be undone.`
              : `${applicationNumber} will be recorded as approved and the applicant will see the decision. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor={remarksId} className="text-sm font-medium">
            {isRejection ? 'Reason for rejection' : 'Remarks (optional)'}
          </label>
          <textarea
            id={remarksId}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={4}
            maxLength={2000}
            required={isRejection}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder={
              isRejection
                ? 'Explain why this application is being rejected. The applicant will read this.'
                : 'Any note you want recorded with this decision.'
            }
          />
          {isRejection && trimmed.length === 0 && (
            <p className="text-xs text-muted-foreground">A reason is required to reject.</p>
          )}
        </div>

        {errorMessage !== null && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isRejection ? 'destructive' : 'default'}
            onClick={() => onConfirm(trimmed)}
            disabled={!canSubmit}
          >
            {isPending
              ? 'Recording…'
              : isRejection
                ? 'Reject application'
                : 'Approve application'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
