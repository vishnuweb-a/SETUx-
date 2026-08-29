import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Replaces the default fallback UI when provided. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it and shows a safe fallback
 * instead of unmounting the whole application.
 *
 * Must remain a class component: React exposes no hook equivalent of
 * `componentDidCatch`. Event-handler and async errors are NOT caught here —
 * those surface through TanStack Query's error state instead.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Development aid only. A real reporting sink is wired up when the project
    // adopts one; sensitive values must never be forwarded here.
    if (import.meta.env.DEV) {
      console.error('Unhandled UI error:', error, errorInfo.componentStack);
    }
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error === null) {
      return children;
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertOctagon className="size-8 text-destructive" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page could not be displayed. You can try again, or reload if the problem persists.
        </p>
        {/* Error text is shown in development only: messages can carry internals. */}
        {import.meta.env.DEV && (
          <pre className="max-w-lg overflow-x-auto rounded-md bg-muted p-3 text-left font-mono text-xs">
            {error.message}
          </pre>
        )}
        <div className="mt-2 flex gap-2">
          <Button onClick={this.handleReset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Go to start
          </Button>
        </div>
      </main>
    );
  }
}
