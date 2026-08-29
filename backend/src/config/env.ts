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
