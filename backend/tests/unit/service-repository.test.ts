import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The catalogue repository's query construction.
 *
 * These assertions are about the *shape of the query* rather than its result:
 * that the publication predicate is always present, that pagination is
 * deterministic, and that a search term is neutralised before it becomes an
 * `ilike` pattern. A stubbed query builder records what was asked for.
 */

interface QueryCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let calls: QueryCall[] = [];
let result: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };

/**
 * A chainable stand-in for the PostgREST builder.
 *
 * Every method records its call and returns the same object, so a chain like
 * `.select().eq().or().order().range()` is captured in order. It is also
 * thenable, which is how `await builder` resolves to the canned result.
 */
const createBuilder = () => {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'or', 'order', 'range', 'maybeSingle']) {
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

const { listActiveServices, findActiveServiceById } = await import(
  '../../src/modules/services/service.repository.js'
);

/** The `or(...)` filter string, or `undefined` when no search was applied. */
const orFilter = (): string | undefined =>
  calls.find((call) => call.method === 'or')?.args[0] as string | undefined;

const eqCalls = (): readonly (readonly unknown[])[] =>
  calls.filter((call) => call.method === 'eq').map((call) => call.args);

beforeEach(() => {
  calls = [];
  result = { data: [], error: null, count: 0 };
});

describe('listActiveServices', () => {
  const baseQuery = { page: 1, limit: 12 } as const;

  it('always filters on ACTIVE status', async () => {
    await listActiveServices(baseQuery);

    expect(eqCalls()).toContainEqual(['status', 'ACTIVE']);
  });

  it('never selects the status column into the payload', async () => {
    await listActiveServices(baseQuery);

    const selected = calls.find((call) => call.method === 'select')?.args[0] as string;
    expect(selected).not.toContain('status');
  });

  it('orders by name so pagination is deterministic', async () => {
    await listActiveServices(baseQuery);

    expect(calls.find((call) => call.method === 'order')?.args[0]).toBe('name');
  });

  it('translates page and limit into an inclusive range', async () => {
    await listActiveServices({ page: 3, limit: 10 });

    // Page 3 at 10 per page is rows 20..29 inclusive.
    expect(calls.find((call) => call.method === 'range')?.args).toEqual([20, 29]);
  });

  it('applies no search filter when none was given', async () => {
    await listActiveServices(baseQuery);

    expect(orFilter()).toBeUndefined();
  });

  it('searches name, description and department', async () => {
    await listActiveServices({ ...baseQuery, search: 'merit' });

    expect(orFilter()).toBe(
      'name.ilike.%merit%,description.ilike.%merit%,department.ilike.%merit%',
    );
  });

  it('escapes the ilike wildcards so they match literally', async () => {
    await listActiveServices({ ...baseQuery, search: '100%_x' });

    // Both metacharacters are escaped; without this, `%` would match everything.
    expect(orFilter()).toContain('100\\%\\_x');
  });

  it('escapes a comma so it cannot terminate the filter list', async () => {
    await listActiveServices({ ...baseQuery, search: 'a,b' });

    const filter = orFilter() ?? '';

    // The comma inside the term is escaped, so PostgREST reads it as part of
    // the pattern rather than as the separator starting a fourth predicate.
    expect(filter).toContain('a\\,b');
    expect(filter).toBe(
      'name.ilike.%a\\,b%,description.ilike.%a\\,b%,department.ilike.%a\\,b%',
    );
  });

  it('applies a department filter when one is given', async () => {
    await listActiveServices({ ...baseQuery, department: 'Social Welfare' });

    expect(eqCalls()).toContainEqual(['department', 'Social Welfare']);
  });
});

describe('findActiveServiceById', () => {
  it('filters on both the id and ACTIVE status', async () => {
    result = { data: null, error: null };

    await findActiveServiceById('service-1');

    expect(eqCalls()).toContainEqual(['id', 'service-1']);
    expect(eqCalls()).toContainEqual(['status', 'ACTIVE']);
  });

  it('returns null when no visible service matches', async () => {
    result = { data: null, error: null };

    await expect(findActiveServiceById('service-1')).resolves.toBeNull();
  });
});
