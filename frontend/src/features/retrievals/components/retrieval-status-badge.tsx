import { CheckCircle2, CircleSlash, Clock, Download, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RetrievalAvailability } from '../types/retrieval.types';

/**
 * Status is carried by an icon and a word, never by colour alone (Phase 8 §44).
 *
 * "Retrieved" is deliberate and load-bearing: SetuX has fetched the document,
 * and has NOT verified it. Verification is a later phase, and using its
 * vocabulary here would tell the citizen something untrue (Phase 8 §32).
 */
const PRESENTATION = {
  AVAILABLE: { label: 'Ready to fetch', variant: 'secondary', Icon: Download },
  CONSENT_REQUIRED: { label: 'Consent needed', variant: 'secondary', Icon: Clock },
  CONSENT_DENIED: { label: 'Denied', variant: 'destructive', Icon: CircleSlash },
  COMPLETED: { label: 'Retrieved', variant: 'success', Icon: CheckCircle2 },
  RETRYABLE: { label: 'Could not fetch', variant: 'destructive', Icon: TriangleAlert },
  NOT_SUPPORTED: { label: 'Not available yet', variant: 'secondary', Icon: Clock },
} as const satisfies Record<
  RetrievalAvailability,
  { label: string; variant: string; Icon: unknown }
>;

export function RetrievalStatusBadge({
  availability,
}: {
  readonly availability: RetrievalAvailability;
}) {
  const { label, variant, Icon } = PRESENTATION[availability];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
