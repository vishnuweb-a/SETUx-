import { z } from 'zod';

/**
 * Validated browser environment.
 *
 * Only `VITE_*` values exist here and every one of them is public. Privileged
 * credentials (notably the Supabase service-role key) belong to the backend.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z.url().default('http://localhost:3000/api/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  throw new Error(`Invalid frontend environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
