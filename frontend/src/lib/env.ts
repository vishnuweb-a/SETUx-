import { z } from 'zod';

/**
 * Validated browser environment.
 *
 * Only `VITE_*` values exist here and every one of them is public. Privileged
 * credentials (notably the Supabase service-role key) belong to the backend.
 */
const envSchema = z.object({
  /**
   * Where the browser sends API calls.
   *
   * Accepts either a same-origin path (`/api/v1` — the development default,
   * served through the Vite proxy) or an absolute URL (a deployed backend).
   * A relative path is preferred in development because it makes the request
   * same-origin, which takes CORS and the IPv4/IPv6 origin mismatch out of the
   * sign-in path entirely.
   */
  VITE_API_BASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith('/') || URL.canParse(value),
      { error: 'VITE_API_BASE_URL must be an absolute URL or a path beginning with "/".' },
    )
    // A trailing slash would produce `//api/v1//health` once a path is appended.
    .transform((value) => value.replace(/\/+$/, ''))
    .default('/api/v1'),

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
