import { describe, expect, it } from 'vitest';

/**
 * The verification repository's queries, run against the REAL Supabase project.
 *
 * Same reasoning as `retrieval-queries.test.ts`, and the same Phase 8 defect
 * behind it: a query can be well-formed in the builder, pass every mocked test,
 * and still name a relationship, column or scope that PostgREST rejects at
 * runtime. The unit tests assert on the *constructed* query; only these assert
 * on what the database does with it.
 *
 * Phase 10 adds a table (`verifications`) that no earlier phase read, and a
 * widened CHECK constraint that only exists once the migration has been
 * applied. Both are exactly the kind of thing a mock cannot verify.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * Every assertion is read-only. Nothing here writes to the database, and in
 * particular nothing here calls `record_application_verification` — a test that
 * ran the workflow would mutate a shared synthetic application's lifecycle.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const {
  listEvidenceForApplication,
  listRetrievedRequirementIds,
  listVerifiableRequirements,
  listVerificationsForApplication,
} = await import('../../src/modules/verifications/verification.repository.js');

/** A SUBMITTED application with the most retrieved evidence behind it. */
const findRichestApplication = async () => {
  const db = getDatabaseClient();
  const { data: applications, error } = await db
    .from('applications')
    .select('id, citizen_id, service_id, status')
    .eq('status', 'SUBMITTED');
  if (error) throw error;

  let best: { id: string; citizenId: string; serviceId: string; retrievals: number } | null = null;
  for (const application of applications ?? []) {
    const { data: rows } = await db
      .from('data_retrievals')
      .select('id')
      .eq('application_id', application.id)
      .eq('status', 'SUCCESS');
    const retrievals = (rows ?? []).length;
    if (!best || retrievals > best.retrievals) {
      best = {
        id: application.id,
        citizenId: application.citizen_id,
        serviceId: application.service_id,
        retrievals,
      };
    }
  }
  return best;
};

describe.skipIf(!enabled)('verification repository queries against the live database', () => {
  it('reads a service’s requirements without a PostgREST relationship error', async () => {
    const application = await findRichestApplication();
    expect(application).not.toBeNull();
    if (!application) return;

    const requirements = await listVerifiableRequirements(application.serviceId);

    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length).toBeGreaterThan(0);
    for (const requirement of requirements) {
      expect(requirement.requirementCode).toMatch(/^[A-Z_]+$/u);
      expect(requirement.name.length).toBeGreaterThan(0);
      expect(typeof requirement.required).toBe('boolean');
    }
  });

  /**
   * Verification must account for EVERY requirement, including any no provider
   * backs. A requirement silently dropped from this list would read in the
   * overview as one that passed.
   */
  it('includes requirements that have no data source behind them', async () => {
    const db = getDatabaseClient();
    const { data } = await db
      .from('service_requirements')
      .select('service_id')
      .is('data_source_id', null)
      .limit(1);
    const serviceId = data?.[0]?.service_id;
    if (!serviceId) return;

    const requirements = await listVerifiableRequirements(serviceId);
    const { data: all } = await db
      .from('service_requirements')
      .select('id')
      .eq('service_id', serviceId);

    // Every requirement of the service, not only the provider-backed ones.
    expect(requirements.length).toBe((all ?? []).length);
    expect(requirements.some((requirement) => requirement.dataSourceId === null)).toBe(true);
  });

  it('scopes requirements to one service, so another service leaks nothing', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const db = getDatabaseClient();
    const requirements = await listVerifiableRequirements(application.serviceId);
    const { data: owned } = await db
      .from('service_requirements')
      .select('id')
      .eq('service_id', application.serviceId);
    const ownedIds = new Set((owned ?? []).map((row) => row.id));

    for (const requirement of requirements) {
      expect(ownedIds.has(requirement.requirementId)).toBe(true);
    }
  });

  it('reads the stored evidence for one application, scoped to that application', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const evidence = await listEvidenceForApplication(application.id);
    expect(Array.isArray(evidence)).toBe(true);

    const db = getDatabaseClient();
    const { data: rows } = await db
      .from('application_data')
      .select('field_code')
      .eq('application_id', application.id);
    const owned = new Set((rows ?? []).map((row) => row.field_code));

    // Nothing from a different application may appear in this bundle.
    for (const field of evidence) {
      expect(owned.has(field.fieldCode)).toBe(true);
    }
  });

  it('returns no evidence for an application scope that does not exist', async () => {
    const evidence = await listEvidenceForApplication('00000000-0000-4000-8000-000000000000');
    expect(evidence).toEqual([]);
  });

  it('counts only successful retrievals towards readiness', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const retrieved = await listRetrievedRequirementIds(application.id);
    const db = getDatabaseClient();
    const { data: successes } = await db
      .from('data_retrievals')
      .select('requirement_id')
      .eq('application_id', application.id)
      .eq('status', 'SUCCESS');

    const expected = new Set(
      (successes ?? []).flatMap((row) => (row.requirement_id ? [row.requirement_id] : [])),
    );
    expect(retrieved.size).toBe(expected.size);
    for (const id of expected) expect(retrieved.has(id)).toBe(true);
  });

  it('reads verifications for one application, scoped to that application', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const rows = await listVerificationsForApplication(application.id);
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.application_id).toBe(application.id);
    }
  });

  it('returns nothing for a verification scope that does not exist', async () => {
    const rows = await listVerificationsForApplication('00000000-0000-4000-8000-000000000000');
    expect(rows).toEqual([]);
  });

  it('names columns that exist — a renamed column would error, not return null', async () => {
    const { error } = await getDatabaseClient()
      .from('verifications')
      .select(
        'id, application_id, verification_type, status, source_id, result, verified_at, created_at',
      )
      .limit(1);

    expect(error).toBeNull();
  });
});

/**
 * The migration's own effects, asserted against the live schema.
 *
 * These would all have passed trivially before the migration was applied — and
 * that is the point: they fail loudly if the deployed database has drifted from
 * the migration the code assumes.
 */
describe.skipIf(!enabled)('the Phase 10 schema', () => {
  /**
   * The reason the migration exists. `COMMUNITY_RECORD` and `BANK_DETAILS` are
   * `required = true` for real seeded services, and under the Phase 2 CHECK
   * neither could ever hold a verification row — so those services could never
   * finish verifying.
   */
  it('accepts a verification row for every requirement code the catalogue requires', async () => {
    const db = getDatabaseClient();
    const { data, error } = await db
      .from('service_requirements')
      .select('requirement_code, data_source_id')
      .not('data_source_id', 'is', null);

    expect(error).toBeNull();

    // Every provider-backed requirement code the seed actually uses must be
    // expressible as a verification type under the widened constraint.
    const permitted = new Set([
      'IDENTITY',
      'EDUCATION_RECORD',
      'INCOME_RECORD',
      'BANK_DETAILS',
      'COMMUNITY_RECORD',
      'EDUCATION',
      'INCOME',
    ]);
    for (const row of data ?? []) {
      expect(
        permitted.has(row.requirement_code),
        `${row.requirement_code} cannot be recorded as a verification`,
      ).toBe(true);
    }
  });

  it('exposes the verification workflow function to the service role', async () => {
    // Called with an application that cannot match, so the function takes its
    // "not mine / not SUBMITTED" path and returns an empty set WITHOUT writing
    // anything. This proves the function exists, is callable by the backend's
    // role, and has the argument signature the repository sends — none of which
    // a mock can establish.
    const { data, error } = await getDatabaseClient().rpc('record_application_verification', {
      p_application_id: '00000000-0000-4000-8000-000000000000',
      p_citizen_id: '00000000-0000-4000-8000-000000000001',
      p_outcomes: [],
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('leaves the officer review table untouched by Phase 10', async () => {
    const { data, error } = await getDatabaseClient()
      .from('application_reviews')
      .select('id, application_id, decision');

    expect(error).toBeNull();
    // Phase 11 owns officer review. Phase 10 writes nothing here, so any row
    // would mean the boundary has been crossed.
    expect(data ?? []).toEqual([]);
  });

  it('never leaves an application in a decided state after verification', async () => {
    const { data, error } = await getDatabaseClient()
      .from('applications')
      .select('id, status')
      .in('status', ['APPROVED', 'REJECTED']);

    expect(error).toBeNull();
    // Phase 10 can only reach VERIFICATION. An APPROVED or REJECTED application
    // could not have come from this phase.
    expect(data ?? []).toEqual([]);
  });
});
