import { Check, Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface OnboardingFieldProps {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  /** Server- or client-side error for this field; renders and marks the input. */
  readonly error?: string;
  /** Leading glyph, matching the reference's per-field icons. */
  readonly icon?: ReactNode;
  /** Extra control rendered before the input, e.g. the `+91` prefix. */
  readonly prefix?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Label + control + error, laid out as in the approved onboarding references.
 *
 * Exists so every onboarding input gets the same three things without each
 * form repeating them: a `<label htmlFor>` bound to the control, `aria-invalid`
 * and `aria-describedby` wired to the message, and the message rendered in text
 * rather than signalled by a red border alone (Phase 4 §52).
 *
 * It composes the shared `Input` primitive rather than restyling one, so
 * onboarding does not fork the design system (Phase 4 §34).
 */
export function OnboardingField({
  id,
  label,
  required,
  error,
  icon,
  prefix,
  children,
  className,
}: OnboardingFieldProps) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </label>

      <div className="flex min-w-0 items-stretch gap-2">
        {prefix}
        <div className="relative min-w-0 flex-1">
          {icon && (
            <span
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            >
              {icon}
            </span>
          )}
          {children}
        </div>
      </div>

      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A text input sized and styled for the onboarding forms.
 *
 * The height, radius and inset icon padding come from the reference; the
 * accessibility wiring comes from the `error` prop so a caller cannot forget it.
 */
export function OnboardingInput({
  id,
  error,
  hasIcon,
  className,
  ...props
}: React.ComponentProps<'input'> & { readonly error?: string; readonly hasIcon?: boolean }) {
  return (
    <Input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(
        'h-12 rounded-xl bg-secondary/30',
        hasIcon && 'pl-10',
        error && 'border-destructive',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The verified-email row from both references: read-only, with a green
 * "Verified" marker.
 *
 * Rendered as static text rather than a disabled input because the value is not
 * editable and is not submitted — the backend reads the email from the
 * authenticated session, so re-collecting it here would be asking for an
 * identity claim the API correctly ignores (onboarding.md §12, §16).
 */
export function VerifiedEmailField({
  label,
  email,
}: {
  readonly label: string;
  readonly email: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <div className="flex h-12 min-w-0 items-center gap-2.5 rounded-xl border border-input bg-secondary/40 px-3.5">
        <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
          <Check className="size-3.5" aria-hidden />
          Verified
        </span>
      </div>
    </div>
  );
}
