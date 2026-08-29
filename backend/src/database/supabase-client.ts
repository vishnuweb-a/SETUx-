import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import type { Database } from './database.types.js';

/** A Supabase client bound to the SetuX `public` schema types. */
export type SetuxDatabaseClient = SupabaseClient<Database, 'public'>;

/**
 * The single server-side Supabase client for the whole backend.
 *
 * This client authenticates with the **service-role key**, so it bypasses Row
 * Level Security entirely. That is deliberate: the backend is the trusted tier
 * and enforces authorization itself (RBAC in middleware, ownership checks in
 * services). RLS remains as defence in depth for any path that reaches the
 * database with a user's own JWT — see `docs/SECURITY/security-design.md` §19.
 *
 * Because RLS is bypassed here, **every repository query must scope its own
 * access explicitly**. Never assume the database will filter rows for you.
 *
 * Import this module only from backend code. It must never be reachable from
 * `frontend/`.
 */
let client: SetuxDatabaseClient | undefined;

export const getDatabaseClient = (): SetuxDatabaseClient => {
  client ??= createClient<Database, 'public'>(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: {
        // A server has no browser session to persist or refresh, and doing so
        // would leak one request's identity into the next.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-application-name': config.serviceName },
      },
    },
  );

  return client;
};
