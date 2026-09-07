import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DatabaseModule from '../../src/database/index.js';

/**
 * The field policy repository's query construction
 * (Change & Correction Service, Phase 1).
 *
 * These assertions are about the *shape of the query* rather than its result.
 * One of them matters more than the rest: `active = true` must be part of every
 * predicate. A retired policy that is filtered out after the rows are read is a
 * retired policy that a query-manipulation bug can surface; one that is never
 * selected cannot be surfaced at all.
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

const { findActiveFieldPolicy, listActiveFieldPolicies } = await import(
  '../../src/modules/field-policies/field-policy.repository.js'
);

const eqCalls = (): readonly (readonly unknown[])[] =>
  calls.filter((call) => call.method === 'eq').map((call) => call.args);

const selectedColumns = (): string =>
  calls.find((call) => call.method === 'select')?.args[0] as string;

/** One policy row as PostgREST returns it, in snake_case. */
const HOLDER_NAME_ROW = {
  field_key: 'identityHolderName',
  editability: 'CONDITIONALLY_EDITABLE',
  requires_evidence: true,
  requires_review: true,
  authority: 'Identity Authority',
  dependency_group: 'LEGAL_NAME',
};

beforeEach(() => {
  calls = [];
  result = { data: [], error: null };
});

describe('listActiveFieldPolicies', () => {
  it('reads field_policies scoped to the record type and to active rows', async () => {
    await listActiveFieldPolicies('IDENTITY_RECORD');

    expect(calls[0]).toEqual({ method: 'from', args: ['field_policies'] });
    expect(eqCalls()).toEqual([
      ['record_type', 'IDENTITY_RECORD'],
      ['active', true],
    ]);
  });

  it('orders by field key so the same record type always renders the same way', async () => {
    await listActiveFieldPolicies('INCOME_RECORD');

    expect(calls.find((call) => call.method === 'order')?.args).toEqual([
      'field_key',
      { ascending: true },
    ]);
  });

  it('selects no internal column the API does not expose', async () => {
    await listActiveFieldPolicies('BANK_DETAILS');

    // Split rather than substring-match: `id` is a substring of
    // `requires_evidence`, so `toContain` would pass on a column list that does
    // select the id.
    const columns = selectedColumns()
      .split(',')
      .map((column) => column.trim());

    expect(columns).toEqual([
      'field_key',
      'editability',
      'requires_evidence',
      'requires_review',
      'authority',
      'dependency_group',
    ]);
    for (const internal of ['id', 'active', 'created_at', 'updated_at']) {
      expect(columns).not.toContain(internal);
    }
  });

  it('maps snake_case columns onto the domain contract', async () => {
    result = { data: [HOLDER_NAME_ROW], error: null };

    await expect(listActiveFieldPolicies('IDENTITY_RECORD')).resolves.toEqual([
      {
        fieldKey: 'identityHolderName',
        editability: 'CONDITIONALLY_EDITABLE',
        requiresEvidence: true,
        requiresReview: true,
        authority: 'Identity Authority',
        dependencyGroup: 'LEGAL_NAME',
      },
    ]);
  });

  it('surfaces a database failure as an AppError rather than a raw driver error', async () => {
    result = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

    await expect(listActiveFieldPolicies('IDENTITY_RECORD')).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe('findActiveFieldPolicy', () => {
  it('scopes by record type, field key and active together', async () => {
    await findActiveFieldPolicy('EDUCATION_RECORD', 'educationStudentName');

    expect(eqCalls()).toEqual([
      ['record_type', 'EDUCATION_RECORD'],
      ['field_key', 'educationStudentName'],
      ['active', true],
    ]);
  });

  it('returns null when no active policy matches', async () => {
    result = { data: null, error: null };

    await expect(
      findActiveFieldPolicy('IDENTITY_RECORD', 'identityUnknownField'),
    ).resolves.toBeNull();
  });

  it('maps the matched row onto the domain contract', async () => {
    result = { data: HOLDER_NAME_ROW, error: null };

    await expect(
      findActiveFieldPolicy('IDENTITY_RECORD', 'identityHolderName'),
    ).resolves.toMatchObject({
      fieldKey: 'identityHolderName',
      editability: 'CONDITIONALLY_EDITABLE',
      requiresEvidence: true,
    });
  });
});
