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
 * Note that this badge stops at verification. There is no "Approved" or
 * "Rejected" here because Phase 10 cannot produce either: an application whose
 * checks have all passed is waiting for an officer, not accepted (§23).
 */
const PRESENTATION = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SUBMITTED: { label: 'Submitted', variant: 'success' },
  VERIFICATION: { label: 'Verification in progress', variant: 'default' },
} as const satisfies Record<ApplicationStatus, { label: string; variant: string }>;

export function ApplicationStatusBadge({ status }: { readonly status: ApplicationStatus }) {
  const { label, variant } = PRESENTATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}
