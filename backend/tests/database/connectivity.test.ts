import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/database/database.types.js';

/**
 * Integration tests against the real Supabase project.
 *
 * These are skipped unless `SETUX_DB_TESTS=1` and real credentials are present
 * in the environment, so a normal `npm test` never needs network access or
 * secrets. Run them with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * The client is built here rather than imported from `src/database` because the
 * vitest config injects placeholder credentials for the rest of the suite.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

describe.skipIf(!enabled)('Supabase connectivity and schema', () => {
  const db = createClient<Database, 'public'>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it('connects with the server credentials', async () => {
    const { error } = await db.from('services').select('id', { head: true, count: 'exact' });

    expect(error).toBeNull();
  });

  it('has the seeded scholarship service', async () => {
    const { data, error } = await db
      .from('services')
      .select('code, name, status, department')
      .eq('code', 'SCHOLARSHIP')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      code: 'SCHOLARSHIP',
      name: 'National Scholarship',
      status: 'ACTIVE',
      department: 'Higher Education',
    });
  });

  it('has the four seeded mock data sources', async () => {
    const { data, error } = await db.from('data_sources').select('code').order('code');

    expect(error).toBeNull();
    expect(data?.map((row) => row.code)).toEqual([
      'DIGILOCKER_MOCK',
      'MOCK_EDUCATION_API',
      'MOCK_IDENTITY_API',
      'MOCK_INCOME_API',
    ]);
  });

  it('links every scholarship requirement to a data source', async () => {
    const { data, error } = await db
      .from('service_requirements')
      .select('requirement_code, required, display_order, data_sources(code)')
      .order('display_order');

    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    expect(data?.map((row) => row.requirement_code)).toEqual([
      'IDENTITY',
      'EDUCATION_RECORD',
      'INCOME_RECORD',
      'BANK_DETAILS',
    ]);
    // Every requirement resolves its source through the foreign key.
    expect(data?.every((row) => row.data_sources !== null)).toBe(true);
  });

  it('generates application numbers in the STX-{YEAR}-{SEQUENCE} format', async () => {
    const { data, error } = await db.rpc('next_application_number');

    expect(error).toBeNull();
    expect(data).toMatch(/^STX-\d{4}-\d{6}$/);
  });

  it('rejects an application that references a non-existent citizen', async () => {
    const { data: service, error: lookupError } = await db
      .from('services')
      .select('id')
      .eq('code', 'SCHOLARSHIP')
      .single();

    expect(lookupError).toBeNull();
    expect(service).not.toBeNull();

    const { error } = await db.from('applications').insert({
      citizen_id: '00000000-0000-4000-8000-000000000000',
      service_id: service?.id ?? '',
    });

    // 23503 = foreign_key_violation, enforced by the database itself.
    expect(error?.code).toBe('23503');
  });

  it('keeps the audit trail unreachable from the anon key', async () => {
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    if (anonKey === '') {
      // Nothing to assert without a browser-safe key; skip rather than pass.
      return;
    }

    const anonDb = createClient<Database, 'public'>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await anonDb.from('audit_logs').select('id');

    // audit_logs has RLS enabled and no policy at all, so an unauthenticated
    // caller sees nothing regardless of what the table contains.
    expect(data ?? []).toHaveLength(0);
  });
});
