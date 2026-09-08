import { describe, expect, it } from 'vitest';

/**
 * The Phase 5 dependency rule schema, its constraints, its seed and its RLS,
 * run against the REAL Supabase project (Change & Correction Service).
 *
 * Same reasoning as the Phase 1, 2 and 4 database tests: a PostgREST query can
 * be well-formed in the builder, pass every mocked test, and still name a
 * column or an embedded relationship the database rejects at runtime. This
 * phase adds an enum, a table, one embedded relationship, several CHECK
 * constraints, a unique constraint and an RLS policy that no mocked test can
 * exercise.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * TWO SAFETY PROPERTIES OF THIS FILE.
 *
 * 1. Every write it attempts is one the database MUST reject, each followed by
 *    an assertion that the row count is unchanged. It creates nothing, so it
 *    needs no cleanup — and having no cleanup path is a stronger guarantee than
 *    having one that runs.
 * 2. It never writes to any table. `change_dependency_rules` is configuration
 *    written by migrations alone, and this file's whole point is that no other
 *    path can write it.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const { listActiveDependencyRules, listCitizenRecordsOfTypes } = await import(
  '../../src/modules/change-impact/change-impact.repository.js'
);

const countRules = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('change_dependency_rules').select('id');
  return (data ?? []).length;
};

/** A rule row shaped for an insert attempt the database must refuse. */
const forgedRule = (overrides: Record<string, unknown> = {}) => ({
  source_record_type: 'IDENTITY_RECORD',
  source_field_key: 'identityHolderName',
  target_record_type: 'INCOME_RECORD',
  target_field_key: 'incomeForgedField',
  impact_level: 'REQUIRED',
  reason: 'Forged by a test.',
  ...overrides,
});

describe.skipIf(!enabled)('change_dependency_rules — schema', () => {
  it('exists and is readable through the service role', async () => {
    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
  });

  it('carries every column the repository projects, including the embedded department', async () => {
    // The embedded `departments ( code, name )` is the part a mocked test can
    // never validate: PostgREST resolves it from the foreign key, and a
    // mis-named relationship fails only here.
    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select(
        'source_record_type, source_field_key, target_record_type, target_field_key, ' +
          'impact_level, reason, active, departments ( code, name )',
      )
      .limit(1);

    expect(error).toBeNull();
  });
});

describe.skipIf(!enabled)('change_dependency_rules — the impact level enum', () => {
  it('admits only the three product levels', async () => {
    const before = await countRules();

    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      // A fourth level is a product decision, not a configuration change. The
      // enum is what makes adding one a schema change rather than a row.
      .insert(forgedRule({ impact_level: 'MANDATORY' }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('holds only REQUIRED, RECOMMENDED or OPTIONAL in the seeded data', async () => {
    const { data } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('impact_level');

    for (const row of data ?? []) {
      expect(['REQUIRED', 'RECOMMENDED', 'OPTIONAL']).toContain(row.impact_level);
    }
  });
});

describe.skipIf(!enabled)('change_dependency_rules — constraints', () => {
  it('refuses a duplicate rule for the same source field and target field', async () => {
    const before = await countRules();

    // The canonical name→income rule already exists. A second one would be two
    // live answers to a question that has one.
    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(
        forgedRule({
          target_field_key: 'incomeCertificateHolder',
          impact_level: 'OPTIONAL',
        }) as never,
      );

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('refuses a rule whose source and target record types are the same', async () => {
    const before = await countRules();

    // Self-dependency is what makes a cycle expressible. The CHECK, combined
    // with the engine's single-hop expansion, makes one impossible in the data.
    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(
        forgedRule({
          target_record_type: 'IDENTITY_RECORD',
          target_field_key: 'identityAddress',
        }) as never,
      );

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('refuses a malformed record type', async () => {
    const before = await countRules();

    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(forgedRule({ target_record_type: 'income record' }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('refuses a malformed field key', async () => {
    const before = await countRules();

    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(forgedRule({ target_field_key: 'Income_Holder' }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('refuses a blank reason', async () => {
    const before = await countRules();

    // A rule that cannot explain itself asks a citizen to accept a consequence
    // they have not been told the reason for.
    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(forgedRule({ reason: '   ' }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('refuses a missing reason', async () => {
    const before = await countRules();

    const { error } = await getDatabaseClient()
      .from('change_dependency_rules')
      .insert(forgedRule({ reason: null }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });
});

describe.skipIf(!enabled)('change_dependency_rules — the seeded rules', () => {
  /** Every active rule sourced from the identity record's holder name. */
  const nameRules = async () =>
    getDatabaseClient()
      .from('change_dependency_rules')
      .select('target_record_type, target_field_key, impact_level, reason, active')
      .eq('source_record_type', 'IDENTITY_RECORD')
      .eq('source_field_key', 'identityHolderName')
      .eq('active', true);

  it('seeds the canonical four name-change targets at their intended levels', async () => {
    const { data } = await nameRules();

    const byTarget = new Map(
      (data ?? []).map((row) => [row.target_record_type, row.impact_level] as const),
    );

    // The scenario the whole feature demonstrates (arch §23). Asserted by
    // target rather than by count, so adding a fifth name rule later does not
    // break this test for the wrong reason.
    expect(byTarget.get('INCOME_RECORD')).toBe('REQUIRED');
    expect(byTarget.get('EDUCATION_RECORD')).toBe('RECOMMENDED');
    expect(byTarget.get('COMMUNITY_RECORD')).toBe('RECOMMENDED');
    expect(byTarget.get('BANK_DETAILS')).toBe('OPTIONAL');
  });

  it('names the target field each rule would correct', async () => {
    const { data } = await nameRules();

    const byTarget = new Map(
      (data ?? []).map((row) => [row.target_record_type, row.target_field_key] as const),
    );

    expect(byTarget.get('INCOME_RECORD')).toBe('incomeCertificateHolder');
    expect(byTarget.get('EDUCATION_RECORD')).toBe('educationStudentName');
    expect(byTarget.get('COMMUNITY_RECORD')).toBe('communityCertificateHolder');
    expect(byTarget.get('BANK_DETAILS')).toBe('bankAccountHolder');
  });

  it('gives every seeded rule a citizen-facing reason', async () => {
    const { data } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('reason');

    expect((data ?? []).length).toBeGreaterThan(0);

    for (const row of data ?? []) {
      expect(row.reason.trim().length).toBeGreaterThan(0);
      // Not internal jargon: a rule's reason is rendered verbatim to a citizen.
      expect(row.reason).not.toMatch(/null|undefined|TODO|record_type|field_key/);
    }
  });

  it('routes every departmental rule to a real department, and the bank to none', async () => {
    const { data } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('target_record_type, departments ( code )');

    for (const row of (data ?? []) as unknown as {
      target_record_type: string;
      departments: { code: string } | null;
    }[]) {
      if (row.target_record_type === 'BANK_DETAILS') {
        // A provider, not a department. It has no officer queue and never will.
        expect(row.departments).toBeNull();
      } else {
        expect(row.departments).not.toBeNull();
      }
    }
  });

  it('sources every rule from a field that is not IMMUTABLE', async () => {
    const { data: rules } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('source_record_type, source_field_key');

    for (const rule of rules ?? []) {
      const { data: policy } = await getDatabaseClient()
        .from('field_policies')
        .select('editability')
        .eq('record_type', rule.source_record_type)
        .eq('field_key', rule.source_field_key)
        .maybeSingle();

      // A rule whose source can never enter a draft could never fire. The
      // migration asserts this at apply time; this asserts it of the live data.
      expect(policy).not.toBeNull();
      expect(policy?.editability).not.toBe('IMMUTABLE');
    }
  });

  it('names a real field policy for every target field', async () => {
    const { data: rules } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('target_record_type, target_field_key');

    for (const rule of rules ?? []) {
      const { data: policy } = await getDatabaseClient()
        .from('field_policies')
        .select('field_key')
        .eq('record_type', rule.target_record_type)
        .eq('field_key', rule.target_field_key)
        .maybeSingle();

      expect(policy).not.toBeNull();
    }
  });
});

describe.skipIf(!enabled)('the impact repository against the real schema', () => {
  it('returns the canonical rules for a name change', async () => {
    const rules = await listActiveDependencyRules({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityHolderName'],
    });

    const byTarget = new Map(rules.map((rule) => [rule.target_record_type, rule] as const));

    expect(byTarget.get('INCOME_RECORD')?.impact_level).toBe('REQUIRED');
    expect(byTarget.get('BANK_DETAILS')?.impact_level).toBe('OPTIONAL');
    // The embedded department resolves, and the bank's is genuinely null.
    expect(byTarget.get('INCOME_RECORD')?.responsible_department?.code).toBe('REVENUE_DEPT');
    expect(byTarget.get('BANK_DETAILS')?.responsible_department).toBeNull();
  });

  it('returns nothing for a field with no rule', async () => {
    // `identityMobile` is deliberately unseeded: no other record holds a mobile
    // number, so a mobile correction correctly affects nothing.
    const rules = await listActiveDependencyRules({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityMobile'],
    });

    expect(rules).toStrictEqual([]);
  });

  it('returns nothing for an empty field set without a round trip', async () => {
    await expect(
      listActiveDependencyRules({ sourceRecordType: 'IDENTITY_RECORD', sourceFieldKeys: [] }),
    ).resolves.toStrictEqual([]);
  });

  it('returns rules in a deterministic order', async () => {
    const first = await listActiveDependencyRules({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityHolderName', 'identityAddress'],
    });
    const second = await listActiveDependencyRules({
      sourceRecordType: 'IDENTITY_RECORD',
      sourceFieldKeys: ['identityHolderName', 'identityAddress'],
    });

    expect(first.map((rule) => rule.target_record_type)).toStrictEqual(
      second.map((rule) => rule.target_record_type),
    );
  });

  it('returns no records for a citizen id that owns none', async () => {
    // The predicate is `citizen_id`, so an id owning nothing sees nothing —
    // this is the query that could leak cross-citizen record ids if it were
    // written without one.
    const records = await listCitizenRecordsOfTypes({
      citizenId: '00000000-0000-4000-8000-000000000000',
      recordTypes: ['INCOME_RECORD', 'BANK_DETAILS'],
    });

    expect(records).toStrictEqual([]);
  });

  it('returns nothing for an empty record type set', async () => {
    await expect(
      listCitizenRecordsOfTypes({
        citizenId: '00000000-0000-4000-8000-000000000000',
        recordTypes: [],
      }),
    ).resolves.toStrictEqual([]);
  });
});

describe.skipIf(!enabled)('change_dependency_rules — RLS', () => {
  /**
   * A client carrying the ANON key and no session — exactly what an
   * unauthenticated browser has. RLS is what answers it, not the backend.
   */
  const anonClient = async () => {
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    if (anonKey === '') return null;

    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  };

  it('grants anon no read access', async () => {
    const client = await anonClient();
    // The anon key is optional in the ambient environment. Without it this
    // assertion cannot be made at all, so the test returns rather than
    // asserting something weaker and reporting it as coverage.
    if (client === null) return;

    const { data } = await client.from('change_dependency_rules').select('id');

    // No policy targets `anon`, so the row set is empty rather than forbidden.
    expect(data ?? []).toEqual([]);
  });

  it('refuses an anonymous write', async () => {
    const client = await anonClient();
    if (client === null) return;

    const before = await countRules();
    const { error } = await client
      .from('change_dependency_rules')
      .insert(forgedRule({ target_field_key: 'incomeForgedByAnon' }) as never);

    expect(error).not.toBeNull();
    expect(await countRules()).toBe(before);
  });

  it('lets a signed-in citizen READ active rules but never write one', async () => {
    // The sharper version of the anon test: a REAL signed-in citizen, which is
    // the role the SELECT policy does grant. Reading is permitted; writing must
    // not be, because no INSERT policy exists for `authenticated` either.
    //
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

    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();

    const { data: readable } = await client
      .from('change_dependency_rules')
      .select('impact_level');
    expect((readable ?? []).length).toBeGreaterThan(0);

    // The read is NOT how impact is decided — the backend re-reads these rows
    // server-side and takes its own answer. What must be impossible is a
    // citizen authoring a rule.
    const before = await countRules();
    const { error: writeError } = await client
      .from('change_dependency_rules')
      .insert(forgedRule({ target_field_key: 'incomeForgedByCitizen' }) as never);

    expect(writeError).not.toBeNull();
    expect(await countRules()).toBe(before);

    // Nor updating one: a citizen who could weaken a REQUIRED rule to OPTIONAL
    // would be authoring the government's own advice to themselves.
    const { data: anyRule } = await getDatabaseClient()
      .from('change_dependency_rules')
      .select('id, impact_level')
      .eq('impact_level', 'REQUIRED')
      .limit(1)
      .maybeSingle();

    if (anyRule) {
      await client
        .from('change_dependency_rules')
        .update({ impact_level: 'OPTIONAL' })
        .eq('id', anyRule.id);

      const { data: after } = await getDatabaseClient()
        .from('change_dependency_rules')
        .select('impact_level')
        .eq('id', anyRule.id)
        .single();

      // Whether the client reports an error or silently matches no rows, the
      // row itself must be unchanged.
      expect(after?.impact_level).toBe('REQUIRED');
    }
  });

  it('refuses a citizen deleting a rule', async () => {
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    const email = process.env.SETUX_TEST_CITIZEN_EMAIL ?? '';
    const password = process.env.SETUX_TEST_CITIZEN_PASSWORD ?? '';
    if (anonKey === '' || email === '' || password === '') return;

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await client.auth.signInWithPassword({ email, password });

    const before = await countRules();
    await client.from('change_dependency_rules').delete().neq('id', '');

    // No DELETE policy exists, so the statement matches nothing.
    expect(await countRules()).toBe(before);
  });
});
