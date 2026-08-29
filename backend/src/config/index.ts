import { env } from './env.js';

const SERVICE_NAME = 'setux-backend';
const API_PREFIX = '/api/v1';

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
    /** Origins are configured as a comma-separated string; empty entries are dropped. */
    corsOrigins: env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
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
