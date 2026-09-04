import { Badge } from '@/components/ui/badge';
import type { ApplicationStatus } from '../types/application.types';

export function ApplicationStatusBadge({ status }: { readonly status: ApplicationStatus }) {
  return <Badge variant={status === 'SUBMITTED' ? 'success' : 'secondary'}>{status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</Badge>;
}
