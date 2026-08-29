import { config } from '../../config/index.js';
import { logger } from '../../shared/logger/index.js';
import { pingDatabase } from './health.repository.js';
import type { DependencyHealth, HealthStatus } from './health.types.js';

/**
 * Probes Supabase connectivity.
 *
 * A failure is reported as `down` rather than thrown: the health endpoint must
 * still answer when a dependency is unavailable, so that a monitor can tell
 * "the API is down" apart from "the database is down". The underlying error is
 * logged but never returned — it would disclose infrastructure detail.
 */
const checkDatabase = async (): Promise<DependencyHealth> => {
  const startedAt = performance.now();

  try {
    await pingDatabase();
    return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (err) {
    logger.error({ err }, 'Database health probe failed');
    return { status: 'down', latencyMs: Math.round(performance.now() - startedAt) };
  }
};

/**
 * Reports liveness of the backend process and of the dependencies it needs to
 * serve requests.
 */
export const getHealthStatus = async (): Promise<HealthStatus> => {
  const database = await checkDatabase();

  return {
    service: config.serviceName,
    status: database.status === 'up' ? 'healthy' : 'degraded',
    environment: config.env,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies: { database },
  };
};
