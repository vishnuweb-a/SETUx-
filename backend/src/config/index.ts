import { env } from './env.js';

const SERVICE_NAME = 'setux-backend';
const API_PREFIX = '/api/v1';

/**
 * Extra origins accepted outside production.
 *
 * Vite is pinned to 5173 (`strictPort`), so in the normal case none of these is
 * used. They exist for the developer who deliberately runs the dev server on
 * another port: without them the browser blocks every API call before it
 * reaches a SetuX handler, and sign-in and registration fail with an opaque
 * network error that points nowhere near the real cause.
 *
 * Development only. Production trusts `CORS_ORIGIN` and nothing else.
 */
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
] as const;

/** Parses the comma-separated `CORS_ORIGIN` value; empty entries are dropped. */
const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/**
 * The origins the API answers cross-origin requests for.
 *
 * Production is exactly what `CORS_ORIGIN` names. Development additionally
 * accepts the local Vite ports, de-duplicated so the list stays an allowlist
 * rather than a wildcard.
 */
const resolveCorsOrigins = (): string[] => {
  const configured = parseOrigins(env.CORS_ORIGIN);

  return env.NODE_ENV === 'production'
    ? configured
    : [...new Set([...configured, ...LOCAL_DEV_ORIGINS])];
};

/**
 * Application configuration derived from the validated environment.
 *
 * Import this instead of touching `process.env` anywhere else.
 */
export const config = {
  serviceName: SERVICE_NAME,
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  http: {
    port: env.PORT,
    apiPrefix: API_PREFIX,
    corsOrigins: resolveCorsOrigins(),
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  /**
   * Server-side Supabase credentials.
   *
   * `serviceRoleKey` bypasses RLS. Nothing may log it, echo it in a response, or
   * copy it into a frontend-visible variable.
   */
  supabase: {
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,

    /**
     * Credential endpoints get a tighter budget than the general API
     * (security-design.md §30). Ten attempts per 15 minutes leaves room for a
     * user who mistypes a password without leaving brute force practical.
     */
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 10,
    },
  },
} as const;

export type Config = typeof config;
export { env };
