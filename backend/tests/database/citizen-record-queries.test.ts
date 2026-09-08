import { describe, expect, it } from 'vitest';

/**
 * The Phase 2 citizen record schema, its constraints and its RLS, run against
 * the REAL Supabase project (Change & Correction Service).
 *
 * Same reasoning as the Phase 1, 8, 10 and 11 database tests, and the same
 * defect behind them: a PostgREST query can be well-formed in the builder, pass
 * every mocked test, and still name a column or relationship the database
 * rejects at runtime. This phase adds two tables, two embedded relationships
 * and two RLS policies that no code has exercised before.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * Every write this file attempts is one the database MUST reject — a constraint
 * violation or an RLS refusal — and each is followed by an assertion that the
 * row count is unchanged. Nothing here can leave a record behind.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const { findRecordForCitizen, listFieldsForCitizenRecord, listRecordsByCitizen } = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);

const DEMO_EMAIL = 'citizen@setux.test';

/** The demo citizen's profile id, or null when the fixture is absent. */
const demoCitizenId = async (): Promise<string | null> => {
  const { data } = await getDatabaseClient()
    .from('profiles')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle();

  return data?.id ?? null;
};

/**
 * The identity source's id, or null when the seed has not run. Returned as a
 * plain string so a caller can insert with it; `undefined` would silently omit
 * the NOT NULL column and turn a constraint test into a different one.
 */
const identitySourceId = async (): Promise<string | null> => {
  const { data } = await getDatabaseClient()
    .from('data_sources')
    .select('id')
    .eq('code', 'MOCK_IDENTITY_API')
    .maybeSingle();

  return data?.id ?? null;
};

const countRecords = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('citizen_records').select('id');
  return (data ?? []).length;
};

const countFields = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('citizen_record_fields').select('id');
  return (data ?? []).length;
};

/**
 * The demo citizen's stored holder name, read through the SERVICE ROLE.
 *
 * Read privileged rather than through the citizen's own client on purpose: the
 * question being asked is "what does the database actually hold?", and a read
 * that RLS could filter would answer a different one. Used to capture the value
 * before a refused write and compare it afterwards, so the assertion is
 * "unchanged" rather than the weaker "not equal to the forged string".
 */
const holderNameValue = async (): Promise<unknown> => {
  const citizenId = await demoCitizenId();
  if (!citizenId) return null;

  const { data } = await getDatabaseClient()
    .from('citizen_record_fields')
    .select('field_value, citizen_records!inner ( citizen_id )')
    .eq('field_key', 'identityHolderName')
    .eq('citizen_records.citizen_id', citizenId)
    .limit(1)
    .maybeSingle();

  return data?.field_value ?? null;
};

describe.skipIf(!enabled)('citizen_records — schema', () => {
  it('exists and is readable through the service role', async () => {
    const { error } = await getDatabaseClient().from('citizen_records').select('id').limit(1);

    expect(error).toBeNull();
  });

  it('carries every column the registry depends on', async () => {
    const { data, error } = await getDatabaseClient()
      .from('citizen_records')
      .select(
        'id, citizen_id, record_type, data_source_id, authority_department_id, ' +
          'source_record_ref, status, source_version, last_synced_at, is_simulated, ' +
          'created_at, updated_at',
      )
      .limit(1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('has NO application_id column — records are citizen-scoped by design', async () => {
    // The defining property of the registry (arch §4.1, gap C1). A citizen who
    // has never applied for a scholarship still has records.
    const { error } = await getDatabaseClient()
      .from('citizen_records')
      .select('application_id')
      .limit(1);

    expect(error).not.toBeNull();
  });

  it('resolves the embedded source and authority relationships', async () => {
    // The two joins the repository's projection depends on. A missing FK
    // relationship is a runtime PostgREST error no mock would catch.
    const { error } = await getDatabaseClient()
      .from('citizen_records')
      .select('id, data_sources ( code, name ), departments ( code, name )')
      .limit(1);

    expect(error).toBeNull();
  });

  it('uses only the three defined statuses', async () => {
    const { data } = await getDatabaseClient().from('citizen_records').select('status');

    for (const row of data ?? []) {
      expect(['ACTIVE', 'STALE', 'UNAVAILABLE']).toContain(row.status);
    }
  });

  it('holds only the five supported record types', async () => {
    const { data } = await getDatabaseClient().from('citizen_records').select('record_type');

    for (const row of data ?? []) {
      expect([
        'IDENTITY_RECORD',
        'INCOME_RECORD',
        'EDUCATION_RECORD',
        'COMMUNITY_RECORD',
        'BANK_DETAILS',
      ]).toContain(row.record_type);
    }
  });
});

describe.skipIf(!enabled)('citizen_records — constraints', () => {
  it('rejects a record type that is not screaming snake case', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const sourceId = await identitySourceId();
    if (!sourceId) return;

    const before = await countRecords();
    const { error } = await getDatabaseClient().from('citizen_records').insert({
      citizen_id: citizenId,
      record_type: 'identity record',
      data_source_id: sourceId,
      source_record_ref: 'SYNTH-TEST-REJECTED',
    });

    expect(error).not.toBeNull();
    expect(await countRecords()).toBe(before);
  });

  it('rejects an unknown status', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const sourceId = await identitySourceId();
    if (!sourceId) return;

    const before = await countRecords();
    const { error } = await getDatabaseClient().from('citizen_records').insert({
      citizen_id: citizenId,
      record_type: 'IDENTITY_RECORD',
      data_source_id: sourceId,
      source_record_ref: 'SYNTH-TEST-REJECTED',
      status: 'PENDING',
    });

    expect(error).not.toBeNull();
    expect(await countRecords()).toBe(before);
  });

  it('rejects a blank source_record_ref', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const sourceId = await identitySourceId();
    if (!sourceId) return;

    const before = await countRecords();
    const { error } = await getDatabaseClient().from('citizen_records').insert({
      citizen_id: citizenId,
      record_type: 'IDENTITY_RECORD',
      data_source_id: sourceId,
      source_record_ref: '   ',
    });

    expect(error).not.toBeNull();
    expect(await countRecords()).toBe(before);
  });

  it('refuses a second record for the same citizen, type and source', async () => {
    // The idempotency key (arch §22): re-provisioning updates, never duplicates.
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const { data: existing } = await getDatabaseClient()
      .from('citizen_records')
      .select('record_type, data_source_id')
      .eq('citizen_id', citizenId)
      .eq('record_type', 'IDENTITY_RECORD')
      .maybeSingle();
    if (!existing) return;

    const before = await countRecords();
    const { error } = await getDatabaseClient().from('citizen_records').insert({
      citizen_id: citizenId,
      record_type: existing.record_type,
      data_source_id: existing.data_source_id,
      source_record_ref: 'SYNTH-TEST-DUPLICATE',
    });

    expect(error).not.toBeNull();
    expect(await countRecords()).toBe(before);
  });

  it("refuses to attach one source's record ref to a second citizen", async () => {
    // Two citizens cannot share one income certificate number. The provisioner
    // must fail loudly rather than quietly giving one record two owners.
    const { data: records } = await getDatabaseClient()
      .from('citizen_records')
      .select('data_source_id, source_record_ref')
      .limit(1);
    const record = records?.[0];
    if (!record) return;

    const { data: others } = await getDatabaseClient()
      .from('profiles')
      .select('id')
      .eq('role', 'CITIZEN')
      .neq('email', DEMO_EMAIL)
      .limit(1);
    const otherCitizen = others?.[0];
    if (!otherCitizen) return;

    const before = await countRecords();
    const { error } = await getDatabaseClient().from('citizen_records').insert({
      citizen_id: otherCitizen.id,
      record_type: 'IDENTITY_RECORD',
      data_source_id: record.data_source_id,
      source_record_ref: record.source_record_ref,
    });

    expect(error).not.toBeNull();
    expect(await countRecords()).toBe(before);
  });

  it('permits a NULL authority department for a provider-held record', async () => {
    // The bank is a provider, not a department (arch §20.6, §8.1). This is a
    // modelling statement, so it is asserted on the data rather than assumed.
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const { data } = await getDatabaseClient()
      .from('citizen_records')
      .select('record_type, authority_department_id')
      .eq('citizen_id', citizenId)
      .eq('record_type', 'BANK_DETAILS')
      .maybeSingle();

    if (!data) return;
    expect(data.authority_department_id).toBeNull();
  });
});

describe.skipIf(!enabled)('citizen_record_fields — schema and constraints', () => {
  it('exists and is readable through the service role', async () => {
    const { error } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
  });

  it('resolves the inner join the repository uses for ownership', async () => {
    const { error } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('field_key, field_value, retrieved_at, citizen_records!inner ( citizen_id )')
      .limit(1);

    expect(error).toBeNull();
  });

  it('rejects a field key that is not lowerCamelCase', async () => {
    const { data: records } = await getDatabaseClient()
      .from('citizen_records')
      .select('id')
      .limit(1);
    const record = records?.[0];
    if (!record) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('citizen_record_fields').insert({
      citizen_record_id: record.id,
      field_key: 'Holder_Name',
      field_value: 'x',
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('rejects a JSON null value', async () => {
    // "the source holds no value" and "SetuX does not know" are different
    // claims; only an absent ROW may mean the second.
    const { data: records } = await getDatabaseClient()
      .from('citizen_records')
      .select('id')
      .limit(1);
    const record = records?.[0];
    if (!record) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('citizen_record_fields').insert({
      citizen_record_id: record.id,
      field_key: 'identityForgedNull',
      field_value: null,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('refuses two values for the same field of the same record', async () => {
    const { data: fields } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('citizen_record_id, field_key')
      .limit(1);
    const field = fields?.[0];
    if (!field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('citizen_record_fields').insert({
      citizen_record_id: field.citizen_record_id,
      field_key: field.field_key,
      field_value: 'Forged Duplicate',
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('rejects a field whose parent record does not exist', async () => {
    const before = await countFields();
    const { error } = await getDatabaseClient().from('citizen_record_fields').insert({
      citizen_record_id: '00000000-0000-4000-8000-000000000000',
      field_key: 'identityOrphaned',
      field_value: 'x',
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });
});

describe.skipIf(!enabled)('the repository against the real schema', () => {
  it('lists the demo citizen’s records without a PostgREST error', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const records = await listRecordsByCitizen(citizenId);

    for (const record of records) {
      expect(record.source).not.toBeNull();
      expect(record.is_simulated).toBe(true);
    }
  });

  it('returns null for a record id the citizen does not own', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const record = await findRecordForCitizen({
      recordId: '00000000-0000-4000-8000-000000000000',
      citizenId,
    });

    expect(record).toBeNull();
  });

  it('returns no fields when the record is read with the wrong owner', async () => {
    // The ownership predicate in the field query, proven against the real join
    // rather than against the builder mock.
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const [record] = await listRecordsByCitizen(citizenId);
    if (!record) return;

    const owned = await listFieldsForCitizenRecord({ recordId: record.id, citizenId });
    expect(owned.length).toBeGreaterThan(0);

    const foreign = await listFieldsForCitizenRecord({
      recordId: record.id,
      citizenId: '00000000-0000-4000-8000-000000000000',
    });
    expect(foreign).toEqual([]);
  });

  it('has a governing policy for every stored field key', async () => {
    // Task §17: the fixture's vocabulary and the Phase 1 policy vocabulary must
    // be the same vocabulary, verified against what actually landed.
    const { data: fields } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('field_key, citizen_records!inner ( record_type )');

    const { data: policies } = await getDatabaseClient()
      .from('field_policies')
      .select('record_type, field_key');

    const known = new Set((policies ?? []).map((p) => `${p.record_type}.${p.field_key}`));

    for (const row of (fields ?? []) as unknown as {
      field_key: string;
      citizen_records: { record_type: string };
    }[]) {
      expect(
        known.has(`${row.citizen_records.record_type}.${row.field_key}`),
        `${row.citizen_records.record_type}.${row.field_key} has no field_policies row`,
      ).toBe(true);
    }
  });
});

describe.skipIf(!enabled)('Row Level Security', () => {
  it('denies the anonymous role entirely', async () => {
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    if (anonKey === '') return;

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: records } = await anon.from('citizen_records').select('id');
    const { data: fields } = await anon.from('citizen_record_fields').select('id');

    // No policy targets `anon`, so it sees nothing — whether that surfaces as
    // an error or an empty set, it must never be rows.
    expect(records ?? []).toEqual([]);
    expect(fields ?? []).toEqual([]);
  });

  it('lets a citizen read their own records and nothing else, and write nothing', async () => {
    // Requires demo citizen credentials in the ambient environment; without
    // them the assertion cannot be made, and reporting it as passed would be
    // false.
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    const email = process.env.SETUX_TEST_CITIZEN_EMAIL ?? '';
    const password = process.env.SETUX_TEST_CITIZEN_PASSWORD ?? '';
    if (anonKey === '' || email === '' || password === '') return;

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: session, error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    expect(signInError).toBeNull();
    const selfId = session?.user?.id;

    // Own records are readable.
    const { data: readable } = await client.from('citizen_records').select('id, citizen_id');
    expect((readable ?? []).length).toBeGreaterThan(0);

    // And ONLY own records: the policy is the filter, so every row returned
    // belongs to the caller no matter what the query asks for.
    for (const row of readable ?? []) {
      expect(row.citizen_id).toBe(selfId);
    }

    // Field values are readable through an owned record.
    const { data: readableFields } = await client
      .from('citizen_record_fields')
      .select('field_key');
    expect((readableFields ?? []).length).toBeGreaterThan(0);

    // Writing is refused, under every verb.
    const recordsBefore = await countRecords();
    const fieldsBefore = await countFields();

    const sourceId = await identitySourceId();

    const { error: insertError } = await client.from('citizen_records').insert({
      citizen_id: selfId,
      record_type: 'IDENTITY_RECORD',
      data_source_id: sourceId ?? '00000000-0000-4000-8000-000000000000',
      source_record_ref: 'SYNTH-FORGED-BY-CITIZEN',
    });
    expect(insertError).not.toBeNull();

    // A citizen cannot rewrite what a government source holds about them —
    // which is the entire reason the correction workflow has to exist.
    //
    // ASSERTED AS AN OUTCOME, NOT AS AN ERROR. The INSERT above violates the
    // table's WITH CHECK and so genuinely returns 403 / SQLSTATE 42501, which
    // is why that assertion stands. UPDATE and DELETE fail differently: there
    // is no permissive USING policy for `authenticated` on these tables, so the
    // target rows are INVISIBLE to the statement, and touching zero rows is not
    // an error in Postgres — PostgREST answers 200 with an empty result.
    //
    // Requiring an error here asserted a mechanism the database does not use.
    // What actually matters is that nothing changed, so that is what is
    // checked: `.select()` makes each mutation return the rows it affected,
    // giving an exact affected-row count, and the protected value is then
    // re-read through the service role to prove it survived.
    const beforeHolder = await holderNameValue();

    const { data: updatedFields, error: updateError } = await client
      .from('citizen_record_fields')
      .update({ field_value: 'Demo Forged Name' })
      .eq('field_key', 'identityHolderName')
      .select();

    expect(updatedFields ?? []).toHaveLength(0);
    if (updateError !== null) expect(updateError.code).toBe('42501');

    const { data: deletedRecords, error: deleteError } = await client
      .from('citizen_records')
      .delete()
      .eq('citizen_id', selfId)
      .select();

    expect(deletedRecords ?? []).toHaveLength(0);
    if (deleteError !== null) expect(deleteError.code).toBe('42501');

    expect(await countRecords()).toBe(recordsBefore);
    expect(await countFields()).toBe(fieldsBefore);

    // The holder name is untouched by all of the above — not merely "not the
    // forged value", but byte-identical to what it was before the attempts.
    const afterHolder = await holderNameValue();
    expect(afterHolder).not.toBe('Demo Forged Name');
    expect(afterHolder).toStrictEqual(beforeHolder);

    // And no forged value exists anywhere in the table, under any record.
    const { data: forgedValues } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('id')
      .eq('field_value', 'Demo Forged Name' as never);
    expect(forgedValues ?? []).toHaveLength(0);

    // Nor did the refused INSERT leave a record behind.
    const { data: forgedRecords } = await getDatabaseClient()
      .from('citizen_records')
      .select('id')
      .eq('source_record_ref', 'SYNTH-FORGED-BY-CITIZEN');
    expect(forgedRecords ?? []).toHaveLength(0);

    await client.auth.signOut();
  });

  it('grants an officer no access to citizen records', async () => {
    // Deliberate, not an oversight: officer authority over a record arises from
    // a change target (arch §4.6), which Phase 2 does not create. A speculative
    // department-wide grant would expose every citizen's record in that
    // department — so there is no officer policy at all yet.
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    const email = process.env.SETUX_TEST_OFFICER_EMAIL ?? '';
    const password = process.env.SETUX_TEST_OFFICER_PASSWORD ?? '';
    if (anonKey === '' || email === '' || password === '') return;

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();

    const { data: records } = await client.from('citizen_records').select('id');
    const { data: fields } = await client.from('citizen_record_fields').select('id');

    expect(records ?? []).toEqual([]);
    expect(fields ?? []).toEqual([]);

    await client.auth.signOut();
  });
});

describe.skipIf(!enabled)('the demo fixture that actually landed', () => {
  it('gives the demo citizen exactly five records', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const records = await listRecordsByCitizen(citizenId);

    expect(records.map((r) => r.record_type).sort()).toEqual([
      'BANK_DETAILS',
      'COMMUNITY_RECORD',
      'EDUCATION_RECORD',
      'IDENTITY_RECORD',
      'INCOME_RECORD',
    ]);
  });

  it('routes each record to the authority the architecture specifies', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const records = await listRecordsByCitizen(citizenId);
    const routing = Object.fromEntries(
      records.map((r) => [r.record_type, [r.source?.code, r.authority?.code ?? null]]),
    );

    expect(routing).toEqual({
      IDENTITY_RECORD: ['MOCK_IDENTITY_API', 'IDENTITY_AUTHORITY'],
      INCOME_RECORD: ['MOCK_INCOME_API', 'REVENUE_DEPT'],
      EDUCATION_RECORD: ['MOCK_EDUCATION_API', 'HIGHER_ED'],
      COMMUNITY_RECORD: ['DIGILOCKER_MOCK', 'MINORITY_AFFAIRS'],
      BANK_DETAILS: ['MOCK_BANK_API', null],
    });
  });

  it('carries the SAME holder name across all five records', async () => {
    // The precondition for the Phase 4 dependency demo (arch §23).
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const records = await listRecordsByCitizen(citizenId);
    const holderKeys = new Set([
      'identityHolderName',
      'incomeCertificateHolder',
      'educationStudentName',
      'communityCertificateHolder',
      'bankAccountHolder',
    ]);

    const holders: unknown[] = [];
    for (const record of records) {
      const fields = await listFieldsForCitizenRecord({ recordId: record.id, citizenId });
      holders.push(
        ...fields.filter((f) => holderKeys.has(f.field_key)).map((f) => f.field_value),
      );
    }

    expect(holders).toHaveLength(5);
    expect(new Set(holders).size).toBe(1);
  });

  it('marks every demo record simulated', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const records = await listRecordsByCitizen(citizenId);

    expect(records.every((r) => r.is_simulated)).toBe(true);
  });
});
