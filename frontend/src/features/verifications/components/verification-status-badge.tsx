import { CheckCircle2, Clock, HelpCircle, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VerificationStatus } from '../types/verification.types';

/**
 * Status is carried by an icon and a word, never by colour alone (§32).
 *
 * The wording here is the most load-bearing in the phase.
 *
 * "Could not be verified" is deliberately NOT "Rejected". A FAILED outcome is a
 * finding about one requirement — evidence was read and disagreed — and Phase
 * 10 has no vocabulary for rejecting an application. Whether a mismatch sinks
 * the application is the officer's decision in Phase 11, and a badge saying
 * "Rejected" would announce a decision no one has taken (§24).
 *
 * "Needs review" is likewise not a failure. It is what SetuX says when it
 * cannot conclude — evidence missing, or present but with no business rule
 * defined to judge it. Converting REQUIRES_ACTION into either a pass or a
 * rejection would invent an eligibility conclusion the repository never
 * defines (§25).
 *
 * `warning` rather than `destructive` for both of those is the same point in
 * colour: neither is a final adverse outcome.
 */
const PRESENTATION = {
  PENDING: { label: 'Not checked yet', variant: 'secondary', Icon: Clock },
  VERIFIED: { label: 'Verified', variant: 'success', Icon: CheckCircle2 },
  FAILED: { label: 'Could not be verified', variant: 'warning', Icon: TriangleAlert },
  REQUIRES_ACTION: { label: 'Needs review', variant: 'warning', Icon: HelpCircle },
} as const satisfies Record<
  VerificationStatus,
  { label: string; variant: string; Icon: unknown }
>;

export function VerificationStatusBadge({
  status,
}: {
  /** Null before any rule has evaluated the requirement. */
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
