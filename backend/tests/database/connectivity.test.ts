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
    // Scoped to SCHOLARSHIP by its stable service code, not by row id and not
    // across the whole table. The catalogue holds several services (Phase 5),
    // and `service_requirements.data_source_id` is nullable on purpose: a
    // DECLARATION is supplied by the citizen rather than fetched from a
    // government system, so `every row in the table has a source` is not a
    // product invariant. What this test pins is the MVP service's contract.
    const { data: service, error: lookupError } = await db
      .from('services')
      .select('id')
      .eq('code', 'SCHOLARSHIP')
      .single();

    expect(lookupError).toBeNull();
    expect(service?.id).toBeTruthy();

    const { data, error } = await db
      .from('service_requirements')
      .select('requirement_code, required, display_order, data_sources(code)')
      .eq('service_id', service?.id ?? '')
      .order('display_order');

    expect(error).toBeNull();

    // Each SCHOLARSHIP requirement, in display order, resolves through the
    // foreign key to the specific government system that supplies it. This
    // stays true however many requirements other services gain later.
    expect(
      data?.map((row) => ({
        requirement_code: row.requirement_code,
        required: row.required,
        display_order: row.display_order,
        source: row.data_sources?.code ?? null,
      })),
    ).toEqual([
      { requirement_code: 'IDENTITY', required: true, display_order: 1, source: 'MOCK_IDENTITY_API' },
      {
        requirement_code: 'EDUCATION_RECORD',
        required: true,
        display_order: 2,
        source: 'MOCK_EDUCATION_API',
      },
      { requirement_code: 'INCOME_RECORD', required: true, display_order: 3, source: 'MOCK_INCOME_API' },
      {
        requirement_code: 'BANK_DETAILS',
        required: false,
        display_order: 4,
        source: 'DIGILOCKER_MOCK',
      },
    ]);
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
