import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit cover for the CORS origin resolution itself.
 *
 * The integration test exercises the running app, which always sees
 * `NODE_ENV=test`. This one drives the other branch: production must trust
 * `CORS_ORIGIN` and nothing else, so the development convenience can never
 * widen a deployed allowlist.
 *
 * `config` reads the environment once at import, so each case re-imports the
 * module with a fresh registry.
 */
const loadCorsOrigins = async (env: Record<string, string>): Promise<readonly string[]> => {
  vi.resetModules();

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  const { config } = await import('../../src/config/index.js');
  return config.http.corsOrigins;
};

const BASE_ENV = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-credential',
};

describe('config.http.corsOrigins', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('trusts only CORS_ORIGIN in production', async () => {
    const origins = await loadCorsOrigins({
      ...BASE_ENV,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://setux.example',
    });

    expect(origins).toEqual(['https://setux.example']);
    // The development convenience must not follow the build into production.
    expect(origins).not.toContain('http://localhost:5174');
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false);
  });

  it('honours a multi-origin production list', async () => {
    const origins = await loadCorsOrigins({
      ...BASE_ENV,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://setux.example, https://admin.setux.example',
    });

    expect(origins).toEqual(['https://setux.example', 'https://admin.setux.example']);
  });

  it('adds the local Vite ports outside production', async () => {
    const origins = await loadCorsOrigins({
      ...BASE_ENV,
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:5173',
    });

    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://localhost:5174');
    expect(origins).toContain('http://localhost:5175');
  });

  it('does not duplicate an origin already configured', async () => {
    const origins = await loadCorsOrigins({
      ...BASE_ENV,
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:5173',
    });

    expect(origins.filter((origin) => origin === 'http://localhost:5173')).toHaveLength(1);
    expect(new Set(origins).size).toBe(origins.length);
  });

  it('keeps a custom development origin alongside the defaults', async () => {
    const origins = await loadCorsOrigins({
      ...BASE_ENV,
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:4000',
    });

    expect(origins).toContain('http://localhost:4000');
    expect(origins).toContain('http://localhost:5173');
  });
});
