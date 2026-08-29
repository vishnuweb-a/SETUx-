export interface HealthStatus {
  readonly service: string;
  readonly status: 'healthy';
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}
