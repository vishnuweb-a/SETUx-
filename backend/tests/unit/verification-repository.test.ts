import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The verification repository's query construction.
 *
 * This file exists because of what Phase 8 learned: a repository whose callers
 * all mock it out is never actually executed, so a query that PostgREST refuses
 * passes every service test and fails in production. `listRetrievableRequirements`
 * once asked PostgREST to embed a table it had no foreign key to, answered
 * PGRST200, and turned a whole endpoint into a 500 with nothing to catch it.
 *
 * So these assertions are about the SHAPE of each query — which table, which
 * filters, which scope — rather than about the data that comes back. They are
 * the cheap half of §54; the live query-shape tests are the other half.
 */

interface QueryCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let calls: QueryCall[] = [];
let results: Record<string, { data: unknown; error: unknown }> = {};

const createBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'not', 'order', 'in']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }

  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve(results[table] ?? { data: [], error: null });

  return builder;
};

const rpc = vi.fn();

vi.mock('../../src/database/index.js', async () => {
  const actual = await vi.importActual<typeof DatabaseModule>('../../src/database/index.js');
  return {
    ...actual,
    getDatabaseClient: () => ({
      from: (table: string) => {
        calls.push({ method: 'from', args: [table] });
        return createBuilder(table);
      },
      rpc,
    }),
  };
});

const repository = await import('../../src/modules/verifications/verification.repository.js');

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const CITIZEN_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';

const tablesQueried = () =>
  calls.filter((call) => call.method === 'from').map((call) => call.args[0]);
const selectArgs = () =>
  calls.filter((call) => call.method === 'select').map((call) => String(call.args[0]));
const eqFilters = () =>
  calls.filter((call) => call.method === 'eq').map((call) => [call.args[0], call.args[1]]);

beforeEach(() => {
  calls = [];
  results = {};
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('listVerifiableRequirements', () => {
  it('reads requirements scoped to one service, in display order', async () => {
    await repository.listVerifiableRequirements(SERVICE_ID);
    expect(tablesQueried()).toEqual(['service_requirements']);
    expect(eqFilters()).toContainEqual(['service_id', SERVICE_ID]);
    expect(calls.some((call) => call.method === 'order')).toBe(true);
  });

  it('embeds no related table', async () => {
    // The regression guard. This select must stay flat: `service_requirements`
    // has no FK PostgREST could embed `verifications` or `consents` across.
    await repository.listVerifiableRequirements(SERVICE_ID);
    for (const select of selectArgs()) expect(select).not.toMatch(/\(/u);
  });

  it('does NOT filter out requirements without a data source', async () => {
    // Unlike the retrieval module's equivalent. Verification must account for
    // every requirement a service asks for; one filtered away would read as
    // one that passed (§8).
    await repository.listVerifiableRequirements(SERVICE_ID);
    expect(calls.some((call) => call.method === 'not')).toBe(false);
  });

  it('selects the fields readiness and the overview depend on', async () => {
    await repository.listVerifiableRequirements(SERVICE_ID);
    const select = selectArgs()[0]!;
    for (const column of ['requirement_code', 'name', 'data_source_id', 'required']) {
      expect(select).toContain(column);
    }
  });
});

describe('listEvidenceForApplication', () => {
  it('reads application_data scoped to one application', async () => {
    await repository.listEvidenceForApplication(APPLICATION_ID);
    expect(tablesQueried()).toEqual(['application_data']);
    expect(eqFilters()).toContainEqual(['application_id', APPLICATION_ID]);
  });

  it('reads both provenances rather than filtering to provider rows', async () => {
    // The rules consume PROVIDER_RETRIEVAL only, but the loader returns both so
    // a future declaration-backed rule reads evidence here rather than growing
    // a second evidence path.
    await repository.listEvidenceForApplication(APPLICATION_ID);
    expect(eqFilters().map(([column]) => column)).not.toContain('source_type');
    expect(selectArgs()[0]).toContain('source_type');
  });

  it('drops a value that is not a stored string rather than coercing it', async () => {
    results.application_data = {
      data: [
        { field_code: 'good', field_value: 'MATCHED', source_id: null, source_type: null },
        { field_code: 'bad', field_value: { nested: true }, source_id: null, source_type: null },
      ],
      error: null,
    };
    const evidence = await repository.listEvidenceForApplication(APPLICATION_ID);
    expect(evidence.map((field) => field.fieldCode)).toEqual(['good']);
  });
});

describe('listRetrievedRequirementIds', () => {
  it('counts only successful retrievals, scoped to the application', async () => {
    // Readiness must not be satisfied by a FAILED attempt.
    await repository.listRetrievedRequirementIds(APPLICATION_ID);
    expect(tablesQueried()).toEqual(['data_retrievals']);
    expect(eqFilters()).toContainEqual(['application_id', APPLICATION_ID]);
    expect(eqFilters()).toContainEqual(['status', 'SUCCESS']);
  });

  it('ignores a retrieval with no requirement attribution', async () => {
    results.data_retrievals = {
      data: [{ requirement_id: null }, { requirement_id: 'req-1' }],
      error: null,
    };
    const ids = await repository.listRetrievedRequirementIds(APPLICATION_ID);
    expect([...ids]).toEqual(['req-1']);
  });
});

describe('listVerificationsForApplication', () => {
  it('reads verifications scoped to one application, with no embed', async () => {
    await repository.listVerificationsForApplication(APPLICATION_ID);
    expect(tablesQueried()).toEqual(['verifications']);
    expect(eqFilters()).toContainEqual(['application_id', APPLICATION_ID]);
    for (const select of selectArgs()) expect(select).not.toMatch(/\(/u);
  });
});

describe('recordVerificationRun', () => {
  it('commits through the atomic RPC rather than writing tables directly', async () => {
    // Four writes have to land together. A repository that wrote them
    // separately could leave an application transitioned but unverified (§23).
    await repository.recordVerificationRun({
      applicationId: APPLICATION_ID,
      citizenId: CITIZEN_ID,
      outcomes: [
        {
          requirementCode: 'IDENTITY',
          status: 'VERIFIED',
          reasonCode: 'RULE_MATCH',
          ruleCode: 'IDENTITY_MATCHED_ACTIVE_V1',
          sourceId: null,
          fieldCodes: ['identityMatch'],
        },
      ],
    });

    expect(tablesQueried()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('record_application_verification', {
      p_application_id: APPLICATION_ID,
      p_citizen_id: CITIZEN_ID,
      p_outcomes: [
        {
          requirementCode: 'IDENTITY',
          status: 'VERIFIED',
          reasonCode: 'RULE_MATCH',
          ruleCode: 'IDENTITY_MATCHED_ACTIVE_V1',
          sourceId: null,
          fieldCodes: ['identityMatch'],
        },
      ],
    });
  });

  it('passes the citizen id from the session, never from the outcomes', async () => {
    await repository.recordVerificationRun({
      applicationId: APPLICATION_ID,
      citizenId: CITIZEN_ID,
      outcomes: [],
    });
    expect(rpc.mock.calls[0]![1].p_citizen_id).toBe(CITIZEN_ID);
  });

  it('returns an empty list when the guarded transition wrote nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const rows = await repository.recordVerificationRun({
      applicationId: APPLICATION_ID,
      citizenId: CITIZEN_ID,
      outcomes: [],
    });
    expect(rows).toEqual([]);
  });

  it('raises a database error rather than reporting a silent success', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(
      repository.recordVerificationRun({
        applicationId: APPLICATION_ID,
        citizenId: CITIZEN_ID,
        outcomes: [],
      }),
    ).rejects.toThrow();
  });
});
