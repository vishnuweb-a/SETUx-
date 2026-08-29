import { apiRequest } from '@/services/api-client';

export interface HealthStatus {
  service: string;
  status: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** Calls the backend health endpoint. Used to prove connectivity in Phase 0. */
export const fetchHealth = () => apiRequest<HealthStatus>('/health');
