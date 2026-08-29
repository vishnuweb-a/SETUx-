import { z } from 'zod';

/**
 * Validated browser environment.
 *
 * Only `VITE_*` values exist here and every one of them is public. Privileged
 * credentials (notably the Supabase service-role key) belong to the backend.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z.url().default('http://localhost:3000/api/v1'),

  /**
   * Supabase browser credentials.
   *
   * The anon/publishable key is designed to be public: it identifies the
   * project, and Row Level Security — not the key's secrecy — is what protects
   * the data behind it. The service-role key is a different thing entirely and
   * must never appear here.
   */
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL must be a valid URL.' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, { error: 'VITE_SUPABASE_ANON_KEY is required.' }),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  throw new Error(`Invalid frontend environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
