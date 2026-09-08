import { describe, expect, it } from 'vitest';

/**
 * The Phase 1 field policy schema and repository, run against the REAL Supabase
 * project (Change & Correction Service).
 *
 * Same reasoning as the Phase 8, 10 and 11 database tests, and the same defect
 * behind them: a PostgREST query can be well-formed in the builder, pass every
 * mocked test, and still name a column or relationship the database rejects at
 * runtime. This phase adds a table and an enum no code has read before, so the
 * risk is exactly the one those tests exist for.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * Almost every assertion here is non-mutating. The three that write do so only
 * to prove a CONSTRAINT refuses the write — each is expected to fail, and the
 * test asserts the row count is unchanged afterwards. Nothing here can leave a
 * policy row behind, because every write it attempts is one the database must
 * reject.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');
const { findActiveFieldPolicy, listActiveFieldPolicies } = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);
const { RECORD_TYPE_VALUES } = await import(
  '../../src/modules/field-policies/field-policy.types.js'
);

/** How many policy rows exist right now. */
const countPolicies = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('field_policies').select('id');
  return (data ?? []).length;
};

describe.skipIf(!enabled)('field_policies — schema', () => {
  it('exists and is readable through the service role', async () => {
    const { error } = await getDatabaseClient().from('field_policies').select('id').limit(1);

    expect(error).toBeNull();
  });

  it('carries a policy for every supported record type', async () => {
    // The API declares five record types as a closed enum. If the seed does not
    // cover one of them, that record type is an endpoint returning an empty
    // field list — which is exactly the silent gap this asserts against.
    for (const recordType of RECORD_TYPE_VALUES) {
      const policies = await listActiveFieldPolicies(recordType);

      expect(policies.length, `${recordType} has no seeded policy`).toBeGreaterThan(0);
    }
  });

  it('uses only the three editability values', async () => {
    const { data } = await getDatabaseClient().from('field_policies').select('editability');
    const distinct = new Set((data ?? []).map((row) => row.editability));

    for (const value of distinct) {
      expect(['EDITABLE', 'CONDITIONALLY_EDITABLE', 'IMMUTABLE']).toContain(value);
    }
  });

  it('never marks an IMMUTABLE field as requiring evidence or review', async () => {
    // The CHECK constraint's invariant, verified against the data that actually
    // landed: "you may not change this, and here is what you must supply to
    // change it" is incoherent, and no row may say it.
    const { data } = await getDatabaseClient()
      .from('field_policies')
      .select('record_type, field_key, requires_evidence, requires_review')
      .eq('editability', 'IMMUTABLE');

    for (const row of data ?? []) {
      expect(row.requires_evidence, `${row.record_type}.${row.field_key}`).toBe(false);
      expect(row.requires_review, `${row.record_type}.${row.field_key}`).toBe(false);
    }
  });

  it('holds one policy per (record_type, field_key)', async () => {
    const { data } = await getDatabaseClient()
      .from('field_policies')
      .select('record_type, field_key');
    const keys = (data ?? []).map((row) => `${row.record_type}.${row.field_key}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.skipIf(!enabled)('field_policies — constraints refuse bad policy', () => {
  it('rejects a duplicate policy for a field that already has one', async () => {
    const before = await countPolicies();

    const { error } = await getDatabaseClient().from('field_policies').insert({
      record_type: 'IDENTITY_RECORD',
      field_key: 'identityHolderName',
      editability: 'EDITABLE',
    });

    // 23505 — unique_violation. Two policies for one field would mean "the
    // policy for this field" has two answers.
    expect(error?.code).toBe('23505');
    expect(await countPolicies()).toBe(before);
  });

  it('rejects an IMMUTABLE policy that demands evidence', async () => {
    const before = await countPolicies();

    const { error } = await getDatabaseClient().from('field_policies').insert({
      record_type: 'IDENTITY_RECORD',
      field_key: 'identityImpossiblePolicy',
      editability: 'IMMUTABLE',
      requires_evidence: true,
    });

    // 23514 — check_violation.
    expect(error?.code).toBe('23514');
    expect(await countPolicies()).toBe(before);
  });

  it('rejects a malformed field key', async () => {
    const before = await countPolicies();

    const { error } = await getDatabaseClient().from('field_policies').insert({
      record_type: 'IDENTITY_RECORD',
      field_key: 'Not A Normalized Key',
      editability: 'EDITABLE',
    });

    expect(error?.code).toBe('23514');
    expect(await countPolicies()).toBe(before);
  });

  it('rejects a malformed record type', async () => {
    const before = await countPolicies();

    const { error } = await getDatabaseClient().from('field_policies').insert({
      record_type: 'identity record',
      field_key: 'identitySomething',
      editability: 'EDITABLE',
    });

    expect(error?.code).toBe('23514');
    expect(await countPolicies()).toBe(before);
  });

  it('rejects an editability outside the enum', async () => {
    const before = await countPolicies();

    const { error } = await getDatabaseClient()
      .from('field_policies')
      // The cast is the point: TypeScript already refuses this value, and the
      // test asserts the DATABASE refuses it too, for any caller that is not
      // type-checked.
      .insert({
        record_type: 'IDENTITY_RECORD',
        field_key: 'identitySomethingElse',
        editability: 'SOMETIMES_EDITABLE' as 'EDITABLE',
      });

    expect(error).not.toBeNull();
    expect(await countPolicies()).toBe(before);
  });
});

describe.skipIf(!enabled)('field_policies — repository against the real schema', () => {
  it('reads the identity policy set, ordered by field key', async () => {
    const policies = await listActiveFieldPolicies('IDENTITY_RECORD');
    const keys = policies.map((policy) => policy.fieldKey);

    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain('identityHolderName');
  });

  it('resolves the motivating field as CONDITIONALLY_EDITABLE with both requirements', async () => {
    // The name-change scenario the whole feature exists to demonstrate.
    const policy = await findActiveFieldPolicy('IDENTITY_RECORD', 'identityHolderName');

    expect(policy).toMatchObject({
      editability: 'CONDITIONALLY_EDITABLE',
      requiresEvidence: true,
      requiresReview: true,
    });
  });

  it('resolves a system-generated identifier as IMMUTABLE', async () => {
    const policy = await findActiveFieldPolicy(
      'IDENTITY_RECORD',
      'identityRegistryReference',
    );

    expect(policy?.editability).toBe('IMMUTABLE');
  });

  it('returns null for a field no policy governs', async () => {
    await expect(
      findActiveFieldPolicy('IDENTITY_RECORD', 'identityNoSuchField'),
    ).resolves.toBeNull();
  });
});

describe.skipIf(!enabled)('field_policies — RLS', () => {
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

    const { data } = await client.from('field_policies').select('id');

    // No policy targets `anon`, so the row set is empty rather than forbidden.
    expect(data ?? []).toEqual([]);
  });

  it('refuses an anonymous write', async () => {
    const client = await anonClient();
    if (client === null) return;

    const before = await countPolicies();
    const { error } = await client.from('field_policies').insert({
      record_type: 'IDENTITY_RECORD',
      field_key: 'identityForgedByAnon',
      editability: 'EDITABLE',
    });

    // No INSERT policy exists for any browser role, so the write is refused
    // rather than merely filtered.
    expect(error).not.toBeNull();
    expect(await countPolicies()).toBe(before);
  });

  it('refuses a write carrying an authenticated citizen session', async () => {
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

    // Reading is granted to `authenticated` by design — the change form needs
    // it to explain which fields are eligible.
    const { data: readable } = await client.from('field_policies').select('field_key');
    expect((readable ?? []).length).toBeGreaterThan(0);

    // Writing is not, under any circumstances.
    const before = await countPolicies();
    const { error: writeError } = await client.from('field_policies').insert({
      record_type: 'IDENTITY_RECORD',
      field_key: 'identityForgedByCitizen',
      editability: 'EDITABLE',
    });

    expect(writeError).not.toBeNull();
    expect(await countPolicies()).toBe(before);

    // And an existing policy cannot be rewritten into an editable one.
    //
    // ASSERTED AS AN OUTCOME, NOT AS AN ERROR, and the distinction is a real
    // property of RLS rather than a weaker test. The two verbs fail
    // differently:
    //
    //   INSERT  the new row violates the table's WITH CHECK, so PostgREST
    //           returns 403 / SQLSTATE 42501 — the assertion above is right.
    //   UPDATE  there is no permissive USING policy for `authenticated`, so the
    //           target rows are INVISIBLE to the statement. Updating zero rows
    //           is not an error in Postgres, and PostgREST correctly answers
    //           200 with an empty result.
    //
    // Requiring an error here asserted a mechanism the database does not use,
    // and would have kept failing however secure the table was. What actually
    // matters is that NOTHING CHANGED, so that is what is checked: `.select()`
    // makes the mutation return the rows it affected, giving an exact affected
    // -row count, and the policy is then re-read to prove the stored value
    // survived.
    const { data: updatedRows, error: updateError } = await client
      .from('field_policies')
      .update({ editability: 'EDITABLE' })
      .eq('record_type', 'IDENTITY_RECORD')
      .eq('field_key', 'identityRegistryReference')
      .select();

    // Whether the driver reports an error or a silent no-op, the row count it
    // touched must be zero.
    expect(updatedRows ?? []).toHaveLength(0);
    if (updateError !== null) expect(updateError.code).toBe('42501');

    const stillImmutable = await findActiveFieldPolicy(
      'IDENTITY_RECORD',
      'identityRegistryReference',
    );
    expect(stillImmutable?.editability).toBe('IMMUTABLE');

    // Nor may a policy be deleted. Same shape: zero rows affected, and the row
    // still there afterwards.
    const { data: deletedRows } = await client
      .from('field_policies')
      .delete()
      .eq('record_type', 'IDENTITY_RECORD')
      .eq('field_key', 'identityRegistryReference')
      .select();

    expect(deletedRows ?? []).toHaveLength(0);
    expect(await countPolicies()).toBe(before);
    expect(
      (await findActiveFieldPolicy('IDENTITY_RECORD', 'identityRegistryReference'))?.editability,
    ).toBe('IMMUTABLE');

    // And the forged INSERT above left nothing behind.
    const { data: forged } = await getDatabaseClient()
      .from('field_policies')
      .select('field_key')
      .eq('field_key', 'identityForgedByCitizen');
    expect(forged ?? []).toHaveLength(0);

    await client.auth.signOut();
  });
});
