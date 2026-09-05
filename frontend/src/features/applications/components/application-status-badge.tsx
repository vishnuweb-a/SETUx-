import { Badge } from '@/components/ui/badge';
import type { ApplicationStatus } from '../types/application.types';

/**
 * The application's lifecycle state, in the citizen's words.
 *
 * "Verification in progress" is the friendly label for the database status
 * `VERIFICATION`. The database value is never shown, and neither is
 * "UNDER_VERIFICATION" — that spelling is the phase documents' prose for this
 * same state and does not exist in the schema (§20).
 *
 * "Approved" and "Rejected" are the Phase 11 final states, and they appear here
 * only because a government officer recorded a decision. Verification never
 * produces either: an application whose checks all passed is waiting for an
 * officer, not accepted (§23). That is why VERIFICATION reads "in progress"
 * rather than anything that sounds like an outcome.
 *
 * SUBMITTED is `secondary` rather than `success`: reserving the success colour
 * for APPROVED is what keeps the final decision visually distinct from the
 * intermediate states leading to it.
 */
const PRESENTATION = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  VERIFICATION: { label: 'Verification in progress', variant: 'default' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
} as const satisfies Record<ApplicationStatus, { label: string; variant: string }>;

export function ApplicationStatusBadge({ status }: { readonly status: ApplicationStatus }) {
  const { label, variant } = PRESENTATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}
