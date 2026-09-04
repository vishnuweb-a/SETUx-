import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ConsentStatus } from '../types/consent.types';

/**
 * Status is carried by an icon and a word, never by colour alone — a denied and
 * a granted consent have to be distinguishable without colour vision
 * (Phase 7 §36).
 */
const PRESENTATION = {
  PENDING: { label: 'Awaiting your decision', variant: 'secondary', Icon: Clock },
  GRANTED: { label: 'Allowed', variant: 'success', Icon: CheckCircle2 },
  DENIED: { label: 'Denied', variant: 'destructive', Icon: XCircle },
} as const satisfies Record<ConsentStatus, { label: string; variant: string; Icon: unknown }>;

export function ConsentStatusBadge({ status }: { readonly status: ConsentStatus }) {
  const { label, variant, Icon } = PRESENTATION[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
