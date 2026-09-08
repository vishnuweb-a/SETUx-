import { CircleAlert, CircleDashed, CircleDot } from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ChangeImpactLevel } from '../types/change-impact.types';
import { impactLevelLabel } from '../utils/change-impact-presentation';

/**
 * How strongly a record should be corrected alongside the source (Phase 5).
 *
 * Icon *and* words, never colour alone — the same rule `RecordStatusBadge`
 * follows, and the reason the three levels remain distinguishable to a citizen
 * who cannot tell the colours apart. The icons are deliberately a graded set
 * (filled → dotted → dashed) rather than three unrelated glyphs, so the
 * ORDERING is visible without reading, which is the one thing the badge has to
 * convey at a glance.
 *
 * `warning` rather than `destructive` for REQUIRED. Nothing has gone wrong: the
 * citizen is being told a consequence of a change they are making, and a red
 * badge would read as an error on a screen where there is none.
 */

interface LevelPresentation {
  readonly variant: NonNullable<BadgeProps['variant']>;
  readonly icon: ComponentType<{ className?: string }>;
}

const LEVEL_PRESENTATION: Readonly<Record<ChangeImpactLevel, LevelPresentation>> = {
  REQUIRED: { variant: 'warning', icon: CircleAlert },
  RECOMMENDED: { variant: 'default', icon: CircleDot },
  OPTIONAL: { variant: 'secondary', icon: CircleDashed },
};

export function ImpactLevelBadge({ level }: { readonly level: ChangeImpactLevel }) {
  // An unknown level falls back to the weakest presentation rather than
  // rendering nothing: a card with no badge reads as a bug, and OVER-stating a
  // consequence SetuX does not understand would be worse than under-stating it.
  const presentation = LEVEL_PRESENTATION[level] ?? LEVEL_PRESENTATION.OPTIONAL;
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.variant}>
      <Icon aria-hidden />
      {impactLevelLabel(level)}
    </Badge>
  );
}
