import { config } from '../../config/index.js';
import type { HealthStatus } from './health.types.js';

/**
 * Reports liveness of the backend process itself.
 *
 * Dependency checks (Supabase, connectors) are added by the phases that
 * introduce those dependencies.
 */
export const getHealthStatus = (): HealthStatus => ({
  service: config.serviceName,
  status: 'healthy',
  environment: config.env,
  uptimeSeconds: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
});
