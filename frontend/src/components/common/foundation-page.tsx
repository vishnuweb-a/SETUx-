import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { fetchHealth } from '@/services/health-service';
import { cn } from '@/lib/utils';

/**
 * Phase 0 foundation page.
 *
 * Its only purpose is to prove that React, routing, Tailwind v4 tokens, the
 * query client and the backend connection all work. It is replaced by real
 * screens in later phases and contains no application behaviour.
 */
export function FoundationPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">
          SIH Prototype — Phase 0
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">SetuX</h1>
        <p className="text-muted-foreground">One Platform. Connected Government.</p>
      </header>

      <section
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
        aria-live="polite"
        aria-busy={isPending}
      >
        <h2 className="text-sm font-medium text-card-foreground">Backend connectivity</h2>

        {isPending && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Contacting the SetuX API…
          </p>
        )}

        {isError && (
          <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Could not reach the API. Start the backend with <Code>npm run dev</Code>.
              <span className="mt-1 block text-muted-foreground">{error.message}</span>
            </p>
          </div>
        )}

        {data && (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              <span className="font-medium">{data.service} is {data.status}</span>
            </div>
            <div className="flex gap-2 text-muted-foreground">
              <dt>Environment</dt>
              <dd className="font-medium text-foreground">{data.environment}</dd>
            </div>
          </dl>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        External government systems are simulated for the SIH prototype. No real government API
        integration is assumed unless explicitly documented.
      </p>
    </main>
  );
}

function Code({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <code className={cn('rounded bg-muted px-1 py-0.5 font-mono text-xs', className)}>
      {children}
    </code>
  );
}
