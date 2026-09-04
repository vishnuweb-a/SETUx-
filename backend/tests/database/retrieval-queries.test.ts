import { describe, expect, it } from 'vitest';

/**
 * The retrieval repository's queries, run against the REAL Supabase project.
 *
 * This suite exists because of a specific Phase 8 defect. `GET
 * /applications/:id/retrievals` answered 500 (PGRST200) in the live app while
 * every test passed, because the service-level tests mock the repository module
 * out entirely and the unit tests assert on the *constructed* query rather than
 * on what PostgREST does with it. A query can be well-formed in the builder and
 * still name a relationship that does not exist.
 *
 * So these call the actual repository functions with no mocking and assert that
 * PostgREST accepts them — which is the only thing that catches an invalid
 * embed, a wrong foreign-key assumption or a renamed column. Phase 9 adds three
 * more sources flowing through the same queries, so the coverage matters more,
 * not less.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials, exactly like
 * `connectivity.test.ts`. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * Every assertion is read-only. Nothing here writes to the database.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

// The repository reads its client from the shared database module, so the real
// credentials have to be in place before that module is imported.
if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const { listRetrievableRequirements, listRetrievalsForApplication, listRetrievedFields } =
  await import('../../src/modules/retrievals/retrieval.repository.js');
const { resolveConnector } = await import('../../src/connectors/index.js');

/** A SUBMITTED application whose service names the most distinct data sources. */
const findRichestApplication = async () => {
  const db = getDatabaseClient();
  const { data: applications, error } = await db
    .from('applications')
    .select('id, citizen_id, service_id, status')
    .eq('status', 'SUBMITTED');
  if (error) throw error;

  let best: { id: string; citizenId: string; serviceId: string; sources: number } | null = null;
  for (const application of applications ?? []) {
    const { data: requirements } = await db
      .from('service_requirements')
      .select('data_source_id')
      .eq('service_id', application.service_id)
      .not('data_source_id', 'is', null);
    const sources = new Set((requirements ?? []).map((row) => row.data_source_id)).size;
    if (!best || sources > best.sources) {
      best = {
        id: application.id,
        citizenId: application.citizen_id,
        serviceId: application.service_id,
        sources,
      };
    }
  }
  return best;
};

describe.skipIf(!enabled)('retrieval repository queries against the live database', () => {
  it('reads retrievable requirements without a PostgREST relationship error', async () => {
    const application = await findRichestApplication();
    expect(application).not.toBeNull();
    if (!application) return;

    // The Phase 8 regression: this call raised PGRST200. It must resolve.
    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: application.citizenId,
      serviceId: application.serviceId,
    });

    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length).toBeGreaterThan(0);
  });

  it('resolves each requirement to a real data source code and name', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: application.citizenId,
      serviceId: application.serviceId,
    });

    for (const requirement of requirements) {
      // The embed on `data_sources` is the part that must actually resolve.
      expect(requirement.sourceCode).toMatch(/^[A-Z_]+$/u);
      expect(requirement.sourceName.length).toBeGreaterThan(0);
      expect(requirement.dataSourceId).not.toBe('');
      expect(requirement.requirementCode.length).toBeGreaterThan(0);
    }
  });

  it('routes every source-backed requirement to a registered Phase 9 connector', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: application.citizenId,
      serviceId: application.serviceId,
    });

    // The point of Phase 9: no seeded government source is left unserved, and
    // each resolves to the connector that claims that exact code.
    for (const requirement of requirements) {
      const connector = resolveConnector(requirement.sourceCode);
      expect(connector, `no connector for ${requirement.sourceCode}`).not.toBeNull();
      expect(connector?.sourceCode).toBe(requirement.sourceCode);
      expect(connector?.isSimulated).toBe(true);
    }
  });

  it('scopes requirements to the application service, so another service leaks nothing', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const db = getDatabaseClient();
    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: application.citizenId,
      serviceId: application.serviceId,
    });

    const { data: owned } = await db
      .from('service_requirements')
      .select('id')
      .eq('service_id', application.serviceId);
    const ownedIds = new Set((owned ?? []).map((row) => row.id));

    for (const requirement of requirements) {
      expect(ownedIds.has(requirement.requirementId)).toBe(true);
    }
  });

  it('returns no consent when the citizen scope does not match', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    // Same application, a citizen who does not own it: the consent read is
    // scoped by citizen_id, so no requirement may come back GRANTED.
    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: '00000000-0000-4000-8000-000000000000',
      serviceId: application.serviceId,
    });

    expect(requirements.every((requirement) => requirement.consentStatus === null)).toBe(true);
  });

  it('pairs a consent only with the requirement whose own source it covers', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const db = getDatabaseClient();
    const requirements = await listRetrievableRequirements({
      applicationId: application.id,
      citizenId: application.citizenId,
      serviceId: application.serviceId,
    });
    const { data: consents } = await db
      .from('consents')
      .select('data_source_id, status')
      .eq('application_id', application.id)
      .eq('citizen_id', application.citizenId);

    const statusBySource = new Map(
      (consents ?? []).map((row) => [row.data_source_id, row.status] as const),
    );

    for (const requirement of requirements) {
      // A grant recorded against one source must never surface on a
      // requirement belonging to a different one (Phase 9 §13).
      expect(requirement.consentStatus).toBe(statusBySource.get(requirement.dataSourceId) ?? null);
    }
  });

  it('reads the retrieval history for an application', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const rows = await listRetrievalsForApplication(application.id);

    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.application_id).toBe(application.id);
    }
  });

  it('reads provider-sourced fields, and only provider-sourced fields', async () => {
    const application = await findRichestApplication();
    if (!application) return;

    const fields = await listRetrievedFields(application.id);
    expect(Array.isArray(fields)).toBe(true);

    const db = getDatabaseClient();
    const { data: declared } = await db
      .from('application_data')
      .select('field_code')
      .eq('application_id', application.id)
      .eq('source_type', 'CITIZEN_DECLARATION');
    const declaredCodes = new Set((declared ?? []).map((row) => row.field_code));

    // A citizen declaration must never be read back as retrieved provider data
    // (Phase 9 §21).
    for (const field of fields) {
      expect(field.sourceId).not.toBe('');
      expect(declaredCodes.has(field.fieldCode) && field.sourceId === null).toBe(false);
    }
  });

  it('names columns that exist — a renamed column would error, not return null', async () => {
    const db = getDatabaseClient();

    // Selecting the exact column list the repository uses proves the shape
    // against the live schema rather than against a mock's return value.
    const { error } = await db
      .from('data_retrievals')
      .select(
        'id, application_id, data_source_id, consent_id, requirement_id, request_reference, status, attempt_number, response_metadata, error_code, error_message, completed_at, created_at',
      )
      .limit(1);

    expect(error).toBeNull();
  });
});

describe.skipIf(!enabled)('seeded government sources', () => {
  it('serves every ACTIVE data source with a registered connector', async () => {
    const { data, error } = await getDatabaseClient()
      .from('data_sources')
      .select('code, status')
      .eq('status', 'ACTIVE');

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const source of data ?? []) {
      expect(resolveConnector(source.code), `no connector for ${source.code}`).not.toBeNull();
    }
  });

  it('keeps every requirement code within the set its source connector serves', async () => {
    const db = getDatabaseClient();
    const { data, error } = await db
      .from('service_requirements')
      .select('requirement_code, data_sources(code)')
      .not('data_source_id', 'is', null);

    expect(error).toBeNull();

    for (const row of data ?? []) {
      const source = Array.isArray(row.data_sources) ? row.data_sources[0] : row.data_sources;
      if (!source) continue;
      const connector = resolveConnector(source.code);
      expect(connector).not.toBeNull();
      // Every seeded requirement must be answerable by its own source's
      // connector; an unserved pairing would show in the UI as a permanent
      // "not available", which is a seeding bug rather than a phase boundary.
      await expect(
        connector?.retrieve({
          requirementCode: row.requirement_code,
          correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        }),
      ).resolves.toBeDefined();
    }
  });
});
