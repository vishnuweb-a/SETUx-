import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';

/** Outcome of one backend dependency probe. */
export interface DependencyHealth {
  readonly status: 'up' | 'down';
  readonly latencyMs: number;
}

/** Payload returned by `GET /api/v1/health`. */
export interface HealthStatus {
  readonly service: string;
  /** `degraded` means the API is up but a dependency it needs is not. */
  readonly status: 'healthy' | 'degraded';
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly dependencies: {
    readonly database: DependencyHealth;
  };
}

export const fetchHealth = (signal?: AbortSignal): Promise<HealthStatus> =>
  apiRequest<HealthStatus>('/health', signal ? { signal } : {});

/**
 * Query definition for the backend health check.
 *
 * Infrastructure, not a feature: it exists to prove the frontend/backend
 * contract and gives later phases a worked example of the query-options pattern.
 */
export const healthQueryOptions = () =>
  queryOptions({
    queryKey: ['health'] as const,
    queryFn: ({ signal }) => fetchHealth(signal),
    staleTime: 10_000,
  });
