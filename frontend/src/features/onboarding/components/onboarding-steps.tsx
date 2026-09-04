import { cn } from '@/lib/utils';

export interface OnboardingStepsProps {
  /** Exactly two labels, matching the reference designs. */
  readonly steps: readonly [string, string];
  /** 1-based index of the step in progress. */
  readonly current: 1 | 2;
}

/**
 * The two-step progress indicator from the approved onboarding references
 * (`reference/user-onboard.png`, `reference/gov-employee-onboard.png`).
 *
 * Presentational: it reports where the user is, and nothing about it gates
 * anything. Rendered as an ordered list so assistive technology reads it as the
 * sequence it depicts, with `aria-current` marking the active step rather than
 * relying on colour alone (Phase 4 §52).
 */
export function OnboardingSteps({ steps, current }: OnboardingStepsProps) {
  return (
    <ol className="flex min-w-0 items-center gap-2 sm:gap-3" aria-label="Onboarding progress">
      {steps.map((label, index) => {
        const step = index + 1;
        const isActive = step === current;

        return (
          <li
            key={label}
            className={cn('flex min-w-0 items-center gap-2', index === 0 && 'flex-1')}
            aria-current={isActive ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {step}
            </span>
            <span
              className={cn(
                // Truncates rather than widening the panel on a narrow screen.
                'min-w-0 truncate text-xs sm:text-sm',
                isActive ? 'font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>

            {/* The connector belongs to the first item so it stretches between
                the two labels, as in the reference. */}
            {index === 0 && (
              <span className="ml-1 hidden h-px flex-1 bg-border sm:block" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
