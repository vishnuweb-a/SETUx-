import { CheckCircle2, Clock, FileCheck2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OfficerApplicationStatus } from '../types/government.types';

/**
 * The application's lifecycle state, in the officer's words.
 *
 * "Awaiting review" is the officer-facing label for the database status
 * VERIFICATION. To the citizen that state reads "Verification in progress";
 * to the officer the same state means the work has arrived on their desk. Same
 * row, two audiences, and neither label is the database value.
 *
 * Status is carried by an icon and a word, never by colour alone.
 */
const PRESENTATION = {
  SUBMITTED: { label: 'Not yet verified', variant: 'secondary', Icon: Clock },
  VERIFICATION: { label: 'Awaiting review', variant: 'default', Icon: FileCheck2 },
  APPROVED: { label: 'Approved', variant: 'success', Icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', Icon: XCircle },
} as const satisfies Record<
  OfficerApplicationStatus,
  { label: string; variant: string; Icon: unknown }
>;

export function OfficerStatusBadge({ status }: { readonly status: OfficerApplicationStatus }) {
  const presentation = PRESENTATION[status];
  if (!presentation) return <Badge variant="secondary">{status}</Badge>;

  const { label, variant, Icon } = presentation;
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
