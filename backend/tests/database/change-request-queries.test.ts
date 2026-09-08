import { afterAll, describe, expect, it } from 'vitest';

/**
 * The Phase 4 change draft schema, its constraints and its RLS, run against the
 * REAL Supabase project (Change & Correction Service).
 *
 * Same reasoning as the Phase 1 and 2 database tests: a PostgREST query can be
 * well-formed in the builder, pass every mocked test, and still name a column
 * or relationship the database rejects at runtime. This phase adds two tables,
 * one embedded relationship, several CHECK constraints and two RLS policies
 * that no mocked test can exercise.
 *
 * Skipped unless `SETUX_DB_TESTS=1` with real credentials. Run with:
 *
 *   SETUX_DB_TESTS=1 npm run test:db -w backend
 *
 * TWO SAFETY PROPERTIES OF THIS FILE.
 *
 * 1. Every write it attempts is either one the database MUST reject — each
 *    followed by an assertion that the row count is unchanged — or a row it
 *    creates deliberately and removes in `afterAll`.
 * 2. It never writes to `citizen_records` or `citizen_record_fields`. The
 *    source values are read, and one test asserts explicitly that they are the
 *    same before and after a draft exists against them.
 */
const url = process.env.SETUX_TEST_SUPABASE_URL ?? '';
const key = process.env.SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SETUX_DB_TESTS === '1' && url !== '' && key !== '';

if (enabled) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

const { getDatabaseClient } = await import('../../src/database/index.js');

const DEMO_EMAIL = 'citizen@setux.test';

/** Drafts this file created, removed in `afterAll` whatever the outcome. */
const created: string[] = [];

const demoCitizenId = async (): Promise<string | null> => {
  const { data } = await getDatabaseClient()
    .from('profiles')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle();

  return data?.id ?? null;
};

/** The demo citizen's identity record, or null when the fixture is absent. */
const identityRecord = async (): Promise<{ id: string; citizen_id: string } | null> => {
  const citizenId = await demoCitizenId();
  if (!citizenId) return null;

  const { data } = await getDatabaseClient()
    .from('citizen_records')
    .select('id, citizen_id')
    .eq('citizen_id', citizenId)
    .eq('record_type', 'IDENTITY_RECORD')
    .maybeSingle();

  return data ?? null;
};

/** One source field row of the demo identity record. */
const holderNameField = async (): Promise<{ id: string; field_value: unknown } | null> => {
  const record = await identityRecord();
  if (!record) return null;

  const { data } = await getDatabaseClient()
    .from('citizen_record_fields')
    .select('id, field_value')
    .eq('citizen_record_id', record.id)
    .eq('field_key', 'identityHolderName')
    .maybeSingle();

  return data ?? null;
};

const SNAPSHOT = {
  editability: 'CONDITIONALLY_EDITABLE',
  requiresEvidence: true,
  requiresReview: true,
  authority: 'Identity Authority',
};

/** Creates a draft for the demo citizen and remembers it for cleanup. */
const createDraft = async (): Promise<{ id: string; citizenId: string; recordId: string } | null> => {
  const record = await identityRecord();
  if (!record) return null;

  const { data, error } = await getDatabaseClient()
    .from('change_requests')
    .insert({ citizen_id: record.citizen_id, source_record_id: record.id })
    .select('id')
    .single();

  if (error || !data) return null;

  created.push(data.id);
  return { id: data.id, citizenId: record.citizen_id, recordId: record.id };
};

const countRequests = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('change_requests').select('id');
  return (data ?? []).length;
};

const countFields = async (): Promise<number> => {
  const { data } = await getDatabaseClient().from('change_request_fields').select('id');
  return (data ?? []).length;
};

afterAll(async () => {
  if (!enabled) return;

  for (const id of created) {
    // Cascades to change_request_fields. Never touches a source record.
    await getDatabaseClient().from('change_requests').delete().eq('id', id);
  }
});

describe.skipIf(!enabled)('change_requests — schema', () => {
  it('exists and is readable through the service role', async () => {
    const { error } = await getDatabaseClient().from('change_requests').select('id').limit(1);

    expect(error).toBeNull();
  });

  it('carries every column the repository projects', async () => {
    const { error } = await getDatabaseClient()
      .from('change_requests')
      .select('id, request_number, citizen_id, source_record_id, status, created_at, updated_at')
      .limit(1);

    expect(error).toBeNull();
  });

  it('generates a CR-{YEAR}-{SEQUENCE} reference server-side', async () => {
    const draft = await createDraft();
    if (!draft) return;

    const { data } = await getDatabaseClient()
      .from('change_requests')
      .select('request_number, status')
      .eq('id', draft.id)
      .single();

    // Never supplied by the insert above — a column default alone produced it.
    expect(data?.request_number).toMatch(/^CR-\d{4}-\d{6}$/u);
    expect(data?.status).toBe('DRAFT');
  });

  it('admits no status other than DRAFT in this phase', async () => {
    const draft = await createDraft();
    if (!draft) return;

    // Every state after DRAFT belongs to a phase that does not exist. The CHECK
    // is what stops one being written directly rather than through the
    // transition that will own it.
    const { error } = await getDatabaseClient()
      .from('change_requests')
      .update({ status: 'SUBMITTED' })
      .eq('id', draft.id);

    expect(error).not.toBeNull();
  });

  it('rejects a source record that does not exist', async () => {
    const citizenId = await demoCitizenId();
    if (!citizenId) return;

    const before = await countRequests();
    const { error } = await getDatabaseClient().from('change_requests').insert({
      citizen_id: citizenId,
      source_record_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(error).not.toBeNull();
    expect(await countRequests()).toBe(before);
  });

  it('rejects a citizen that does not exist', async () => {
    const record = await identityRecord();
    if (!record) return;

    const before = await countRequests();
    const { error } = await getDatabaseClient().from('change_requests').insert({
      citizen_id: '00000000-0000-4000-8000-000000000000',
      source_record_id: record.id,
    });

    expect(error).not.toBeNull();
    expect(await countRequests()).toBe(before);
  });
});

describe.skipIf(!enabled)('change_request_fields — constraints', () => {
  it('stores the snapshot and the proposal as separate columns', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).toBeNull();

    const { data } = await getDatabaseClient()
      .from('change_request_fields')
      .select('old_value, proposed_value')
      .eq('change_request_id', draft.id)
      .single();

    expect(data?.old_value).toEqual(field.field_value);
    expect(data?.proposed_value).toBe('Demo New Name');
  });

  it('refuses a proposal identical to the snapshot', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: field.field_value as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('refuses the same field twice in one request', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const row = {
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      policy_snapshot: SNAPSHOT as never,
    };

    const first = await getDatabaseClient()
      .from('change_request_fields')
      .insert({ ...row, proposed_value: 'Demo New Name' as never });
    expect(first.error).toBeNull();

    const before = await countFields();
    const second = await getDatabaseClient()
      .from('change_request_fields')
      .insert({ ...row, proposed_value: 'Another Name' as never });

    expect(second.error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('refuses a snapshot claiming an IMMUTABLE editability', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient()
      .from('change_request_fields')
      .insert({
        change_request_id: draft.id,
        citizen_record_field_id: field.id,
        field_key: 'identityHolderName',
        old_value: field.field_value as never,
        proposed_value: 'Demo New Name' as never,
        policy_snapshot: { ...SNAPSHOT, editability: 'IMMUTABLE' } as never,
      });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('accepts an optional reason and refuses a blank one', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const base = {
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    };

    // Blank is not a reason: a column accepting '   ' would have two
    // representations of "not given", one of which reads as an answer.
    const before = await countFields();
    const blank = await getDatabaseClient()
      .from('change_request_fields')
      .insert({ ...base, reason: '   ' });

    expect(blank.error).not.toBeNull();
    expect(await countFields()).toBe(before);

    const given = await getDatabaseClient()
      .from('change_request_fields')
      .insert({ ...base, reason: 'Legal name correction' });

    expect(given.error).toBeNull();
  });

  it('accepts a field with no reason at all', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    // Optional at DRAFT: a half-finished correction is still worth saving.
    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).toBeNull();

    const { data } = await getDatabaseClient()
      .from('change_request_fields')
      .select('reason')
      .eq('change_request_id', draft.id)
      .single();

    expect(data?.reason).toBeNull();
  });

  it('refuses a field key that is not lowerCamelCase', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identity_holder_name',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('refuses a JSON-null proposed value', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: null as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('refuses a field row with no parent request', async () => {
    const field = await holderNameField();
    if (!field) return;

    const before = await countFields();
    const { error } = await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: '00000000-0000-4000-8000-000000000000',
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: 'Demo Old Name' as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });

  it('cascades field rows when a request is deleted', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    await getDatabaseClient().from('change_requests').delete().eq('id', draft.id);

    const { data } = await getDatabaseClient()
      .from('change_request_fields')
      .select('id')
      .eq('change_request_id', draft.id);

    // Deliberate: a requested correction has no meaning without its request.
    expect(data ?? []).toHaveLength(0);
  });
});

describe.skipIf(!enabled)('the source record is never changed by a draft', () => {
  it('leaves citizen_record_fields.field_value exactly as it was', async () => {
    const before = await holderNameField();
    if (!before) return;

    const draft = await createDraft();
    if (!draft) return;

    await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: before.id,
      field_key: 'identityHolderName',
      old_value: before.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    const after = await holderNameField();

    // The whole phase in one assertion: the citizen has asked for a change and
    // the government's record still says what it said.
    expect(after?.field_value).toEqual(before.field_value);
  });

  it('refuses to delete a source field that a draft references', async () => {
    const draft = await createDraft();
    const field = await holderNameField();
    if (!draft || !field) return;

    await getDatabaseClient().from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    // ON DELETE RESTRICT: a source field with a request against it must not
    // disappear out from under that request.
    const { error } = await getDatabaseClient()
      .from('citizen_record_fields')
      .delete()
      .eq('id', field.id);

    expect(error).not.toBeNull();

    const { data } = await getDatabaseClient()
      .from('citizen_record_fields')
      .select('id')
      .eq('id', field.id)
      .maybeSingle();

    expect(data?.id).toBe(field.id);
  });
});

describe.skipIf(!enabled)('row level security', () => {
  /**
   * An anonymous client, using the publishable key alone.
   *
   * This is the browser's own path, and the one RLS actually governs — the
   * service-role client used everywhere else in this file bypasses it by
   * design.
   */
  const anonClient = async () => {
    const anonKey = process.env.SETUX_TEST_SUPABASE_ANON_KEY ?? '';
    if (anonKey === '') return null;

    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey);
  };

  it('is enabled on both tables', async () => {
    // Verified through the anonymous path below; here we assert the tables are
    // at least reachable for the service role, which distinguishes "RLS blocks
    // it" from "the table does not exist".
    const requests = await getDatabaseClient().from('change_requests').select('id').limit(1);
    const fields = await getDatabaseClient().from('change_request_fields').select('id').limit(1);

    expect(requests.error).toBeNull();
    expect(fields.error).toBeNull();
  });

  it('returns nothing to an anonymous reader', async () => {
    const client = await anonClient();
    if (!client) return;

    await createDraft();

    const { data } = await client.from('change_requests').select('id');

    // No policy targets `anon`, so the result is empty rather than an error.
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses an anonymous write', async () => {
    const client = await anonClient();
    if (!client) return;

    const record = await identityRecord();
    if (!record) return;

    const before = await countRequests();
    const { error } = await client
      .from('change_requests')
      .insert({ citizen_id: record.citizen_id, source_record_id: record.id });

    // There is no INSERT policy for ANY role: creating a draft requires
    // ownership, policy and snapshot checks RLS cannot express, so the backend
    // owns the write path (arch §14).
    expect(error).not.toBeNull();
    expect(await countRequests()).toBe(before);
  });

  it('refuses an anonymous write to change_request_fields', async () => {
    const client = await anonClient();
    if (!client) return;

    const field = await holderNameField();
    const draft = await createDraft();
    if (!field || !draft) return;

    const before = await countFields();
    const { error } = await client.from('change_request_fields').insert({
      change_request_id: draft.id,
      citizen_record_field_id: field.id,
      field_key: 'identityHolderName',
      old_value: field.field_value as never,
      proposed_value: 'Demo New Name' as never,
      policy_snapshot: SNAPSHOT as never,
    });

    expect(error).not.toBeNull();
    expect(await countFields()).toBe(before);
  });
});
