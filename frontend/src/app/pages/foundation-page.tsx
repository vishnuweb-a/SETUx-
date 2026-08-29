import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingState } from '@/components/feedback/loading-state';
import { ApiError } from '@/services/api-client';
import { healthQueryOptions } from '@/services/health-service';

/**
 * Foundation verification screen.
 *
 * Its only purpose is to prove that React, routing, Tailwind v4 tokens, the
 * shared UI primitives, the query client and the backend connection all work
 * end to end. It is replaced by real screens in later phases and deliberately
 * contains no application behaviour.
 */
export function FoundationPage() {
  const { data, isPending, isError, error, refetch } = useQuery(healthQueryOptions());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <Badge variant="secondary">SIH Prototype — Foundation</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">SetuX</h1>
        <p className="text-muted-foreground">One Platform. Connected Government.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Backend connectivity</CardTitle>
          <CardDescription>
            Verifies the API client and query layer can reach <code>GET /api/v1/health</code>.
          </CardDescription>
        </CardHeader>

        <CardContent aria-live="polite" aria-busy={isPending}>
          {isPending && <LoadingState label="Contacting the SetuX API…" />}

          {isError && (
            <ErrorState
              title="Could not reach the API"
              description={
                error instanceof ApiError
                  ? error.message
                  : 'The request failed. Start the backend with npm run dev.'
              }
              requestId={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void refetch()}
            />
          )}

          {data !== undefined && (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                <span className="font-medium">
                  {data.service} is {data.status}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Environment</dt>
                <dd className="font-medium">{data.environment}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Uptime</dt>
                <dd className="font-medium">{data.uptimeSeconds}s</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        External government systems are simulated for the SIH prototype. No real government API
        integration is assumed unless explicitly documented.
      </p>
    </div>
  );
}
