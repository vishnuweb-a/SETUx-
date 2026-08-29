import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'>;

/**
 * Password field with a leading lock icon and a visibility toggle, matching the
 * approved SetuX authentication screen.
 *
 * The field is masked on mount and the toggle is a real `button` with
 * `aria-pressed`, so its state is announced rather than conveyed by icon alone.
 * `tabIndex={-1}` keeps it out of the tab order between the field and the
 * submit button — it is reachable, but it does not interrupt the primary path
 * through the form.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Lock
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        {...props}
        type={isVisible ? 'text' : 'password'}
        className={cn('h-12 rounded-xl bg-secondary/40 pr-12 pl-10', className)}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-pressed={isVisible}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {isVisible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
