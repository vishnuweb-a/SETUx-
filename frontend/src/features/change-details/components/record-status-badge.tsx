import { AlertTriangle, CheckCircle2, CloudOff } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { RecordStatus } from '../types/change-details.types';
import { recordStatusLabel } from '../utils/record-presentation';

/**
 * Whether SetuX's copy of a record is believed current.
 *
 * Icon *and* words, never colour alone: the same rule the application status
 * badge follows, and the reason a red badge and an amber one remain
 * distinguishable to a citizen who cannot tell them apart.
 */

interface StatusPresentation {
  readonly variant: NonNullable<BadgeProps['variant']>;
  readonly icon: ComponentType<{ className?: string }>;
}

const STATUS_PRESENTATION: Readonly<Record<RecordStatus, StatusPresentation>> = {
  ACTIVE: { variant: 'success', icon: CheckCircle2 },
  STALE: { variant: 'warning', icon: AlertTriangle },
  UNAVAILABLE: { variant: 'secondary', icon: CloudOff },
};

export function RecordStatusBadge({ status }: { readonly status: RecordStatus }) {
  const presentation = STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.UNAVAILABLE;
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.variant}>
      <Icon aria-hidden />
      {recordStatusLabel(status)}
    </Badge>
  );
}
