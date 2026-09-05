import { CheckCircle2, Clock, HelpCircle, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VerificationStatus } from '@/features/verifications';

/**
 * A Phase 10 outcome, in the officer's words.
 *
 * The wording is the most load-bearing in this phase, and it differs from the
 * citizen's on one point that matters:
 *
 *   VERIFIED         → "Verified"
 *   FAILED           → "Could not be verified"
 *   REQUIRES_ACTION  → "Needs officer review"
 *
 * REQUIRES_ACTION is deliberately NOT rendered as a failure. It is what SetuX
 * says when it could not conclude — evidence missing, or present with no rule
 * defined to judge it — and it is the single clearest demonstration of why a
 * human officer is part of SetuX at all. Collapsing it into "failed" would
 * erase the reason this phase exists (§13).
 *
 * "Could not be verified" is likewise not "Rejected". A FAILED outcome is a
 * finding about one requirement; whether it sinks the application is the
 * officer's decision, taken below on this same screen. `warning` rather than
 * `destructive` for both makes that visible in colour too: neither is a final
 * adverse outcome, because neither is a decision.
 */
const PRESENTATION = {
  PENDING: { label: 'Not checked', variant: 'secondary', Icon: Clock },
  VERIFIED: { label: 'Verified', variant: 'success', Icon: CheckCircle2 },
  FAILED: { label: 'Could not be verified', variant: 'warning', Icon: TriangleAlert },
  REQUIRES_ACTION: { label: 'Needs officer review', variant: 'warning', Icon: HelpCircle },
} as const satisfies Record<
  VerificationStatus,
  { label: string; variant: string; Icon: unknown }
>;

export function OfficerVerificationBadge({
  status,
}: {
  readonly status: VerificationStatus | null;
}) {
  const { label, variant, Icon } = PRESENTATION[status ?? 'PENDING'];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
