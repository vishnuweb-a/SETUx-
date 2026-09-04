import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ConsentRequest } from '../types/consent.types';

/**
 * Denial is confirmed, granting is not.
 *
 * The asymmetry is on purpose and runs the safe way round: a decision is final
 * for this application, and denying is the one that stops the application being
 * verifiable. Confirming the *destructive* answer is a guard against a misclick;
 * confirming the permissive one would be a nudge towards granting, which is the
 * dark pattern this screen must not have (Phase 7 §27, §30).
 *
 * Radix owns the focus trap, the initial focus, Escape-to-close and the
 * `aria-modal` semantics, so the dialog is keyboard-operable without bespoke
 * handling.
 */
export function DenyConsentDialog({
  consent,
  isPending,
  onCancel,
  onConfirm,
}: {
  readonly consent: ConsentRequest | null;
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (consent: ConsentRequest) => void;
}) {
  return (
    <Dialog open={consent !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {consent && (
          <>
            <DialogHeader>
              <DialogTitle>Deny access to {consent.information}?</DialogTitle>
              <DialogDescription>
                SetuX will not request your {consent.information.toLowerCase()} from{' '}
                {consent.source}. Your application stays as it is, but it cannot be verified without
                this information, and this answer cannot be changed later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
                Go back
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => onConfirm(consent)}
                disabled={isPending}
              >
                Deny access
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
