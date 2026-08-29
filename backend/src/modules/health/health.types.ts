/** Outcome of a single dependency probe. */
export interface DependencyHealth {
  readonly status: 'up' | 'down';
  /** Round-trip time of the probe, in milliseconds. */
  readonly latencyMs: number;
}

export interface HealthStatus {
  readonly service: string;
  /**
   * `healthy` when the process and every checked dependency respond;
   * `degraded` when the process is up but a dependency is not.
   */
  readonly status: 'healthy' | 'degraded';
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly dependencies: {
    readonly database: DependencyHealth;
  };
}
