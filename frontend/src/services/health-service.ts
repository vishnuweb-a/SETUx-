import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/services/api-client';

/** Payload returned by `GET /api/v1/health`. */
export interface HealthStatus {
  readonly service: string;
  readonly status: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
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
