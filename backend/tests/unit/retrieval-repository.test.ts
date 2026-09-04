import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The retrieval repository's query construction.
 *
 * The regression these guard is specific. `listRetrievableRequirements` once
 * asked PostgREST to embed `consents (...)` inside a `service_requirements`
 * select and to filter on `consents.application_id`. No foreign key joins those
 * two tables — `consents` keys on `data_source_id` — so PostgREST answered
 * PGRST200 ("could not find a relationship") and every call to
 * `GET /applications/:id/retrievals` failed with a 500. Nothing caught it,
 * because the service-level tests mock this module out entirely.
 *
 * So these assertions are about the *shape of the query*: that requirements and
 * consents are read separately, that the consent read is scoped to one citizen
 * and one application, and that no embedded-consent filter comes back.
 */

interface QueryCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let calls: QueryCall[] = [];
let results: Record<string, { data: unknown; error: unknown }> = {};

const createBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'not', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve(results[table] ?? { data: [], error: null });

  return builder;
};

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({
      from: (table: string) => {
        calls.push({ method: 'from', args: [table] });
        return createBuilder(table);
      },
    }),
  };
});

const { listRetrievableRequirements } = await import(
  '../../src/modules/retrievals/retrieval.repository.js'
);

const params = {
  applicationId: 'application-1',
  citizenId: 'citizen-1',
  serviceId: 'service-1',
};

const tables = (): readonly string[] =>
  calls.filter((call) => call.method === 'from').map((call) => call.args[0] as string);

const selects = (): readonly string[] =>
  calls.filter((call) => call.method === 'select').map((call) => call.args[0] as string);

const eqCalls = (): readonly (readonly unknown[])[] =>
  calls.filter((call) => call.method === 'eq').map((call) => call.args);

beforeEach(() => {
  calls = [];
  results = {};
});

describe('listRetrievableRequirements', () => {
  it('reads requirements and consents as separate queries', async () => {
    await listRetrievableRequirements(params);

    expect(tables()).toEqual(['service_requirements', 'consents']);
  });

  it('never asks PostgREST to embed consents into service_requirements', async () => {
    await listRetrievableRequirements(params);

    const requirementSelect = selects()[0] ?? '';
    expect(requirementSelect).not.toContain('consents');
  });

  it('never filters on an embedded consents relationship', async () => {
    await listRetrievableRequirements(params);

    const columns = eqCalls().map(([column]) => String(column));
    expect(columns.some((column) => column.startsWith('consents.'))).toBe(false);
  });

  it('scopes the consent read to one application and one citizen', async () => {
    await listRetrievableRequirements(params);

    expect(eqCalls()).toEqual(
      expect.arrayContaining([
        ['application_id', 'application-1'],
        ['citizen_id', 'citizen-1'],
      ]),
    );
  });

  it('pairs each requirement with the consent for its own data source', async () => {
    results = {
      service_requirements: {
        data: [
          {
            id: 'req-granted',
            requirement_code: 'BANK_DETAILS',
            name: 'Bank Account',
            display_order: 1,
            data_source_id: 'source-digilocker',
            data_sources: { code: 'DIGILOCKER_MOCK', name: 'DigiLocker (Mock)' },
          },
          {
            id: 'req-pending',
            requirement_code: 'INCOME_RECORD',
            name: 'Income Record',
            display_order: 2,
            data_source_id: 'source-income',
            data_sources: { code: 'MOCK_INCOME_API', name: 'Income Department (Mock)' },
          },
        ],
        error: null,
      },
      consents: {
        data: [
          { data_source_id: 'source-digilocker', status: 'GRANTED' },
          { data_source_id: 'source-income', status: 'PENDING' },
        ],
        error: null,
      },
    };

    const items = await listRetrievableRequirements(params);

    expect(items.map((item) => [item.requirementId, item.consentStatus])).toEqual([
      ['req-granted', 'GRANTED'],
      ['req-pending', 'PENDING'],
    ]);
  });

  it('reports a null consent status when no consent covers the source', async () => {
    results = {
      service_requirements: {
        data: [
          {
            id: 'req-unconsented',
            requirement_code: 'BANK_DETAILS',
            name: 'Bank Account',
            display_order: 1,
            data_source_id: 'source-digilocker',
            data_sources: { code: 'DIGILOCKER_MOCK', name: 'DigiLocker (Mock)' },
          },
        ],
        error: null,
      },
      consents: { data: [], error: null },
    };

    const [item] = await listRetrievableRequirements(params);

    expect(item?.consentStatus).toBeNull();
  });

  it('does not let one source consent authorize another source', async () => {
    results = {
      service_requirements: {
        data: [
          {
            id: 'req-digilocker',
            requirement_code: 'BANK_DETAILS',
            name: 'Bank Account',
            display_order: 1,
            data_source_id: 'source-digilocker',
            data_sources: { code: 'DIGILOCKER_MOCK', name: 'DigiLocker (Mock)' },
          },
        ],
        error: null,
      },
      consents: { data: [{ data_source_id: 'source-education', status: 'GRANTED' }], error: null },
    };

    const [item] = await listRetrievableRequirements(params);

    expect(item?.consentStatus).toBeNull();
  });
});
