import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The citizen record repository's query construction
 * (Change & Correction Service, Phase 2).
 *
 * These assertions are about the *shape of the query* rather than its result,
 * and one of them is the security property the whole phase rests on:
 *
 *   `citizen_id` must be part of every PREDICATE.
 *
 * A record fetched by id and then rejected in memory has already been fetched —
 * the rejection is observable in timing and in every log line that names the
 * row, and it lives in whichever caller remembers to write it. A record that
 * the query cannot see is genuinely not found. The difference is what makes
 * "somebody else's record" and "no such record" indistinguishable, so it is
 * asserted here rather than assumed.
 */

interface QueryCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let calls: QueryCall[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

/** A chainable, thenable stand-in for the PostgREST builder. */
const createBuilder = () => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'order', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);

  return builder;
};

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({
      from: (table: string) => {
        calls.push({ method: 'from', args: [table] });
        return createBuilder();
      },
    }),
  };
});

const { findRecordForCitizen, listFieldsForCitizenRecord, listRecordsByCitizen } = await import(
  '../../src/modules/citizen-records/citizen-record.repository.js'
);

const eqCalls = (): readonly (readonly unknown[])[] =>
  calls.filter((call) => call.method === 'eq').map((call) => call.args);

const selectedColumns = (): string =>
  calls.find((call) => call.method === 'select')?.args[0] as string;

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  calls = [];
  result = { data: [], error: null };
});

describe('listRecordsByCitizen', () => {
  it('scopes the query to the citizen', async () => {
    await listRecordsByCitizen(CITIZEN_ID);

    expect(eqCalls()).toContainEqual(['citizen_id', CITIZEN_ID]);
  });

  it('reads from citizen_records', async () => {
    await listRecordsByCitizen(CITIZEN_ID);

    expect(calls[0]).toEqual({ method: 'from', args: ['citizen_records'] });
  });

  it('orders newest first, matching the (citizen_id, created_at desc) index', async () => {
    await listRecordsByCitizen(CITIZEN_ID);

    const order = calls.find((call) => call.method === 'order');
    expect(order?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('never selects the internal routing UUIDs', async () => {
    // A client can neither use nor act on data_source_id or
    // authority_department_id; the source and authority are named instead.
    await listRecordsByCitizen(CITIZEN_ID);

    const columns = selectedColumns();
    expect(columns).not.toMatch(/\bdata_source_id\b/);
    expect(columns).not.toMatch(/\bauthority_department_id\b/);
    expect(columns).not.toMatch(/\bcitizen_id\b/);
  });

  it('names the source and the authority through embedded lookups', async () => {
    await listRecordsByCitizen(CITIZEN_ID);

    expect(selectedColumns()).toContain('data_sources ( code, name )');
    expect(selectedColumns()).toContain('departments ( code, name )');
  });

  it('carries a null authority through rather than inventing one', async () => {
    // The bank is a provider, not a department (arch §20.6). The absence is
    // data, not a failed join, and must survive the mapping.
    result = {
      data: [
        {
          id: RECORD_ID,
          record_type: 'BANK_DETAILS',
          source_record_ref: 'SYNTH-BNK-2026-004409',
          status: 'ACTIVE',
          source_version: 'v1',
          last_synced_at: null,
          is_simulated: true,
          created_at: '2026-09-08T00:00:00.000Z',
          updated_at: '2026-09-08T00:00:00.000Z',
          data_sources: { code: 'MOCK_BANK_API', name: 'Demo Public Bank (Simulated)' },
          departments: null,
        },
      ],
      error: null,
    };

    const [row] = await listRecordsByCitizen(CITIZEN_ID);

    expect(row?.authority).toBeNull();
    expect(row?.source).toEqual({
      code: 'MOCK_BANK_API',
      name: 'Demo Public Bank (Simulated)',
    });
  });
});

describe('findRecordForCitizen', () => {
  it('filters on BOTH the record id and the owner', async () => {
    result = { data: null, error: null };

    await findRecordForCitizen({ recordId: RECORD_ID, citizenId: CITIZEN_ID });

    expect(eqCalls()).toContainEqual(['id', RECORD_ID]);
    expect(eqCalls()).toContainEqual(['citizen_id', CITIZEN_ID]);
  });

  it('returns null rather than a row when nothing matches', async () => {
    // The service turns this into the same 404 as an id that never existed, so
    // a caller enumerating UUIDs learns nothing about which of them are real.
    result = { data: null, error: null };

    const row = await findRecordForCitizen({ recordId: RECORD_ID, citizenId: CITIZEN_ID });

    expect(row).toBeNull();
  });
});

describe('listFieldsForCitizenRecord', () => {
  it('re-asserts ownership through the parent record', async () => {
    // Redundant with the caller's own check today, and deliberately so:
    // "redundant today" is how an ownership check gets dropped tomorrow.
    await listFieldsForCitizenRecord({ recordId: RECORD_ID, citizenId: CITIZEN_ID });

    expect(eqCalls()).toContainEqual(['citizen_record_id', RECORD_ID]);
    expect(eqCalls()).toContainEqual(['citizen_records.citizen_id', CITIZEN_ID]);
  });

  it('uses an inner join so a field cannot outlive its ownership check', async () => {
    await listFieldsForCitizenRecord({ recordId: RECORD_ID, citizenId: CITIZEN_ID });

    expect(selectedColumns()).toContain('citizen_records!inner');
  });

  it('orders by field key so a record renders identically on every load', async () => {
    await listFieldsForCitizenRecord({ recordId: RECORD_ID, citizenId: CITIZEN_ID });

    const order = calls.find((call) => call.method === 'order');
    expect(order?.args).toEqual(['field_key', { ascending: true }]);
  });

  it('drops the join column from the mapped result', async () => {
    result = {
      data: [
        {
          field_key: 'identityHolderName',
          field_value: 'Demo Old Name',
          retrieved_at: '2026-09-08T00:00:00.000Z',
          citizen_records: { citizen_id: CITIZEN_ID },
        },
      ],
      error: null,
    };

    const [field] = await listFieldsForCitizenRecord({
      recordId: RECORD_ID,
      citizenId: CITIZEN_ID,
    });

    expect(field).toEqual({
      field_key: 'identityHolderName',
      field_value: 'Demo Old Name',
      retrieved_at: '2026-09-08T00:00:00.000Z',
    });
  });
});

describe('the repository as a whole', () => {
  it('exports no write operation of any kind', async () => {
    // Phase 2 has no record mutation path. Records reach the database through
    // the migration and the trusted provisioner alone (task §22).
    const repository = await import(
      '../../src/modules/citizen-records/citizen-record.repository.js'
    );

    const writeNames = Object.keys(repository).filter((name) =>
      /insert|update|upsert|delete|create|remove|save/i.test(name),
    );

    expect(writeNames).toEqual([]);
  });
});
