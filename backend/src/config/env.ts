import { z } from 'zod';

/**
 * The single place in the backend where `process.env` is read.
 *
 * Every other module imports the parsed `env` object, so a missing or malformed
 * variable fails loudly at startup rather than at the first request that needs it.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Comma-separated list of browser origins permitted to call the API. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Supabase project URL and privileged server key.
   *
   * The service-role key bypasses Row Level Security, so it exists only here in
   * the backend: it must never be given a VITE_ prefix, reach frontend source,
   * be logged, or be returned from an API (docs/SECURITY/security-design.md §20).
   */
  SUPABASE_URL: z.url({ error: 'SUPABASE_URL must be a valid URL.' }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Printed rather than logged: the logger itself depends on this configuration.
  console.error('Invalid backend environment configuration:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
