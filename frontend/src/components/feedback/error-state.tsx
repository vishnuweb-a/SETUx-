import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  /** Safe, user-facing description. Never pass raw server internals here. */
  description?: string;
  /** Correlation id from the API, so a user can quote it in a support request. */
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Generic failure state for an asynchronous operation.
 *
 * Feature phases pass their own copy; this component stays free of any
 * feature-specific knowledge.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'The request could not be completed. Please try again.',
  requestId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertTriangle aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {requestId !== undefined && (
          <p className="font-mono text-xs">Reference: {requestId}</p>
        )}
        {onRetry !== undefined && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
