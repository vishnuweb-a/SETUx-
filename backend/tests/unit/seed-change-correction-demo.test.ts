import { describe, expect, it, vi } from 'vitest';

/**
 * `scripts/seed-change-correction-demo.mjs` — the synthetic demo record
 * provisioner (Change & Correction Service, Phase 2).
 *
 * It is development tooling, but it writes personal-data-shaped rows with the
 * SERVICE ROLE, which bypasses RLS entirely. That is the whole reason these
 * tests exist: the guardrails below are the only thing between a mistyped
 * argument and a script writing synthetic government records onto a real
 * account. The properties pinned here are the ones `seed-auth-users.mjs`
 * learned the hard way:
 *
 *   - `--only` selects a KNOWN fixture and refuses anything else;
 *   - an existing account's role and onboarding progress are read, never
 *     written — the regression that once sent onboarded fixtures back to the
 *     start must not be reintroduced by a second script;
 *   - no credential of any kind is printed or returned;
 *   - a field key with no `field_policies` row stops the run rather than
 *     writing a value the change form can never explain;
 *   - two runs produce the state of one run.
 *
 * No live database is involved: the Supabase client is faked in memory, and
 * every address used here is a synthetic `.test` fixture.
 */

// @ts-expect-error — plain-JS operational script, intentionally untyped.
const provisioner = await import('../../../scripts/seed-change-correction-demo.mjs');

const {
  DEMO_HOLDER_NAME,
  DEMO_RECORDS,
  RECORD_FIXTURES,
  assertFieldKeysMatchPolicies,
  findFixtureCitizen,
  fixtureFieldKeys,
  provisionFixture,
  resolveRouting,
  selectFixtures,
} = provisioner as Record<string, never> & {
  DEMO_HOLDER_NAME: string;
  DEMO_RECORDS: DemoRecord[];
  RECORD_FIXTURES: Fixture[];
  assertFieldKeysMatchPolicies: (supabase: unknown, records?: DemoRecord[]) => Promise<number>;
  findFixtureCitizen: (supabase: unknown, fixture: Fixture) => Promise<StoredProfile>;
  fixtureFieldKeys: (records?: DemoRecord[]) => string[];
  provisionFixture: (
    supabase: unknown,
    fixture: Fixture,
    records?: DemoRecord[],
  ) => Promise<{ profile: StoredProfile; results: { recordType: string; fieldCount: number }[] }>;
  resolveRouting: (supabase: unknown, records?: DemoRecord[]) => Promise<unknown>;
  selectFixtures: (argv: string[], fixtures?: Fixture[]) => Fixture[];
};

interface Fixture {
  label: string;
  email: string;
  role: string;
}

interface DemoRecord {
  recordType: string;
  dataSourceCode: string;
  authorityDepartmentCode: string | null;
  sourceRecordRef: string;
  sourceVersion: string;
  fields: Record<string, unknown>;
}

interface StoredProfile {
  id: string;
  email: string;
  role: string;
  onboarding_status: string;
}

const CITIZEN_ID = '11111111-1111-4111-8111-111111111111';

/** Every field key the fixture writes, with its record type. */
const allPolicyKeys = () =>
  DEMO_RECORDS.flatMap((record) =>
    Object.keys(record.fields).map((field_key) => ({
      record_type: record.recordType,
      field_key,
    })),
  );

/**
 * An in-memory stand-in for the Supabase service-role client.
 *
 * `citizen_records` and `citizen_record_fields` implement real upsert
 * semantics against their actual unique keys, which is what makes the
 * idempotency assertion meaningful rather than a restatement of the mock.
 */
const createFakeSupabase = (options: {
  profiles?: StoredProfile[];
  policyKeys?: { record_type: string; field_key: string }[];
} = {}) => {
  const profiles = options.profiles ?? [
    {
      id: CITIZEN_ID,
      email: 'citizen@setux.test',
      role: 'CITIZEN',
      onboarding_status: 'COMPLETED',
    },
  ];
  const policyKeys = options.policyKeys ?? allPolicyKeys();

  const records: Record<string, unknown>[] = [];
  const fields: Record<string, unknown>[] = [];
  const writes: string[] = [];

  const client = {
    records,
    fields,
    writes,
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({
                data: profiles.find((p) => p.email === value) ?? null,
                error: null,
              }),
            }),
          }),
          // Present so a stray write would be recorded rather than crashing —
          // the assertions below prove none happens.
          update: () => {
            writes.push('profiles.update');
            return { eq: async () => ({ error: null }) };
          },
          upsert: () => {
            writes.push('profiles.upsert');
            return { error: null };
          },
        };
      }

      if (table === 'field_policies') {
        return { select: async () => ({ data: policyKeys, error: null }) };
      }

      if (table === 'data_sources') {
        return {
          select: () => ({
            in: async (_column: string, codes: string[]) => ({
              data: codes.map((code) => ({ id: `source-${code}`, code })),
              error: null,
            }),
          }),
        };
      }

      if (table === 'departments') {
        return {
          select: () => ({
            in: async (_column: string, codes: string[]) => ({
              data: codes.map((code) => ({ id: `dept-${code}`, code })),
              error: null,
            }),
          }),
        };
      }

      if (table === 'citizen_records') {
        return {
          upsert: (row: Record<string, unknown>) => {
            writes.push('citizen_records.upsert');
            const key = `${row.citizen_id}|${row.record_type}|${row.data_source_id}`;
            const existing = records.find(
              (r) => `${r.citizen_id}|${r.record_type}|${r.data_source_id}` === key,
            );
            const id = existing?.id ?? `record-${records.length + 1}`;
            if (existing) Object.assign(existing, row);
            else records.push({ ...row, id });

            return {
              select: () => ({ single: async () => ({ data: { id }, error: null }) }),
            };
          },
        };
      }

      if (table === 'citizen_record_fields') {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            writes.push('citizen_record_fields.upsert');
            for (const row of rows) {
              const key = `${row.citizen_record_id}|${row.field_key}`;
              const existing = fields.find(
                (f) => `${f.citizen_record_id}|${f.field_key}` === key,
              );
              if (existing) Object.assign(existing, row);
              else fields.push({ ...row });
            }
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return client;
};

/**
 * The one fixture this script is allowed to touch. Asserted rather than
 * indexed-and-hoped: an empty allowlist would silently skip every provisioning
 * assertion below while still reporting green.
 */
const FIXTURE = RECORD_FIXTURES[0];
if (!FIXTURE) throw new Error('RECORD_FIXTURES must declare the demo citizen.');

describe('selectFixtures', () => {
  it('returns every fixture without --only', () => {
    expect(selectFixtures([])).toEqual(RECORD_FIXTURES);
  });

  it('selects the known synthetic citizen', () => {
    expect(selectFixtures(['--only', 'citizen@setux.test'])).toEqual([FIXTURE]);
  });

  it('refuses an address that is not a known fixture', () => {
    // The property that stops the script being aimed at a real account.
    expect(() => selectFixtures(['--only', 'someone@example.com'])).toThrow(/refusing to target/);
  });

  it('refuses the officer fixture, which has no records of its own', () => {
    expect(() => selectFixtures(['--only', 'officer@setux.test'])).toThrow(/refusing to target/);
  });

  it('refuses --only with no value', () => {
    expect(() => selectFixtures(['--only'])).toThrow(/requires an email address/);
  });

  it('is case-insensitive about the fixture address', () => {
    expect(selectFixtures(['--only', 'Citizen@SetuX.test'])).toEqual([FIXTURE]);
  });
});

describe('the synthetic fixture itself', () => {
  it('covers exactly the five Phase 2 record types', () => {
    expect(DEMO_RECORDS.map((r) => r.recordType).sort()).toEqual([
      'BANK_DETAILS',
      'COMMUNITY_RECORD',
      'EDUCATION_RECORD',
      'IDENTITY_RECORD',
      'INCOME_RECORD',
    ]);
  });

  it('routes each record to the authority the architecture specifies', () => {
    const routing = Object.fromEntries(
      DEMO_RECORDS.map((r) => [r.recordType, [r.dataSourceCode, r.authorityDepartmentCode]]),
    );

    expect(routing).toEqual({
      IDENTITY_RECORD: ['MOCK_IDENTITY_API', 'IDENTITY_AUTHORITY'],
      INCOME_RECORD: ['MOCK_INCOME_API', 'REVENUE_DEPT'],
      EDUCATION_RECORD: ['MOCK_EDUCATION_API', 'HIGHER_ED'],
      COMMUNITY_RECORD: ['DIGILOCKER_MOCK', 'MINORITY_AFFAIRS'],
      // A provider, not a department: no officer queue, so no department.
      BANK_DETAILS: ['MOCK_BANK_API', null],
    });
  });

  it('gives every record the SAME synthetic holder name', () => {
    // The dependency demo (arch §23) turns ONE correction into four targets.
    // If the records disagreed on the current name there would be nothing to
    // propagate, so this is a property of the fixture, not a coincidence.
    const holderKeys = [
      'identityHolderName',
      'incomeCertificateHolder',
      'educationStudentName',
      'communityCertificateHolder',
      'bankAccountHolder',
    ];

    const holders = DEMO_RECORDS.flatMap((record) =>
      Object.entries(record.fields)
        .filter(([key]) => holderKeys.includes(key))
        .map(([, value]) => value),
    );

    expect(holders).toHaveLength(5);
    expect(new Set(holders)).toEqual(new Set([DEMO_HOLDER_NAME]));
  });

  it('uses only self-evidently synthetic identifiers', () => {
    // No real Aadhaar, PAN, IFSC, account or certificate number anywhere.
    for (const record of DEMO_RECORDS) {
      expect(record.sourceRecordRef).toMatch(/^SYNTH-/);
    }

    const bank = DEMO_RECORDS.find((r) => r.recordType === 'BANK_DETAILS');
    expect(bank?.fields.bankAccountMasked).toMatch(/^X+\d{4}$/);
  });

  it('declares every record simulated by carrying no real institution name', () => {
    const institutions = [
      DEMO_RECORDS.find((r) => r.recordType === 'EDUCATION_RECORD')?.fields
        .educationInstitution,
      DEMO_RECORDS.find((r) => r.recordType === 'COMMUNITY_RECORD')?.fields
        .communityIssuingOffice,
      DEMO_RECORDS.find((r) => r.recordType === 'BANK_DETAILS')?.fields.bankBranchName,
    ];

    for (const name of institutions) {
      expect(String(name)).toMatch(/Simulated|Demo/);
    }
  });

  it('writes 29 field values across the five records', () => {
    const total = DEMO_RECORDS.reduce((sum, r) => sum + Object.keys(r.fields).length, 0);

    expect(total).toBe(29);
    expect(fixtureFieldKeys()).toHaveLength(29);
  });
});

describe('assertFieldKeysMatchPolicies', () => {
  it('passes when every fixture key has a policy row', async () => {
    await expect(assertFieldKeysMatchPolicies(createFakeSupabase())).resolves.toBeGreaterThan(0);
  });

  it('refuses a fixture key no policy governs, naming it', async () => {
    // Task §17: on a mismatch, STOP — fix the fixture to match the
    // authoritative Phase 1 key rather than inventing a second key.
    const supabase = createFakeSupabase({
      policyKeys: allPolicyKeys().filter((k) => k.field_key !== 'identityHolderName'),
    });

    await expect(assertFieldKeysMatchPolicies(supabase)).rejects.toThrow(
      /IDENTITY_RECORD\.identityHolderName/,
    );
  });

  it('treats a key governed for a DIFFERENT record type as unmatched', async () => {
    const supabase = createFakeSupabase({
      policyKeys: allPolicyKeys().map((k) =>
        k.field_key === 'bankAccountHolder' ? { ...k, record_type: 'IDENTITY_RECORD' } : k,
      ),
    });

    await expect(assertFieldKeysMatchPolicies(supabase)).rejects.toThrow(
      /BANK_DETAILS\.bankAccountHolder/,
    );
  });
});

describe('findFixtureCitizen', () => {
  it('returns the profile without writing to it', async () => {
    const supabase = createFakeSupabase();

    const profile = await findFixtureCitizen(supabase, FIXTURE);

    expect(profile.id).toBe(CITIZEN_ID);
    expect(supabase.writes).toEqual([]);
  });

  it('refuses when the fixture account does not exist', async () => {
    // Creating auth users belongs to seed-auth-users.mjs. A records script that
    // could conjure an account would be a second path to an identity.
    const supabase = createFakeSupabase({ profiles: [] });

    await expect(findFixtureCitizen(supabase, FIXTURE)).rejects.toThrow(/seed-auth-users/);
  });

  it('refuses an account whose role is not CITIZEN', async () => {
    const supabase = createFakeSupabase({
      profiles: [
        {
          id: CITIZEN_ID,
          email: 'citizen@setux.test',
          role: 'GOVERNMENT_OFFICER',
          onboarding_status: 'COMPLETED',
        },
      ],
    });

    await expect(findFixtureCitizen(supabase, FIXTURE)).rejects.toThrow(/refusing to provision/);
  });
});

describe('provisionFixture', () => {
  it('creates five records and 29 field values', async () => {
    const supabase = createFakeSupabase();

    const { results } = await provisionFixture(supabase, FIXTURE);

    expect(results).toHaveLength(5);
    expect(supabase.records).toHaveLength(5);
    expect(supabase.fields).toHaveLength(29);
  });

  it('is idempotent — a second run adds nothing', async () => {
    const supabase = createFakeSupabase();

    await provisionFixture(supabase, FIXTURE);
    await provisionFixture(supabase, FIXTURE);

    expect(supabase.records).toHaveLength(5);
    expect(supabase.fields).toHaveLength(29);
  });

  it('keeps record ids stable across runs', async () => {
    // Anything that later references a record by id must not find that id
    // replaced by a re-seed.
    const supabase = createFakeSupabase();

    const first = await provisionFixture(supabase, FIXTURE);
    const second = await provisionFixture(supabase, FIXTURE);

    expect(second.results.map((r) => r.recordType)).toEqual(
      first.results.map((r) => r.recordType),
    );
    expect(supabase.records.map((r) => r.id).sort()).toEqual(
      ['record-1', 'record-2', 'record-3', 'record-4', 'record-5'],
    );
  });

  it('NEVER writes to profiles — role and onboarding are read only', async () => {
    // The regression seed-auth-users.mjs was hardened against, asserted for the
    // second script that could reintroduce it.
    const supabase = createFakeSupabase();

    await provisionFixture(supabase, FIXTURE);

    expect(supabase.writes.filter((w) => w.startsWith('profiles'))).toEqual([]);
  });

  it('reports the existing onboarding status rather than changing it', async () => {
    const supabase = createFakeSupabase();

    const { profile } = await provisionFixture(supabase, FIXTURE);

    expect(profile.onboarding_status).toBe('COMPLETED');
    expect(supabase.writes.filter((w) => w.startsWith('profiles'))).toEqual([]);
  });

  it('writes every record against the same citizen', async () => {
    const supabase = createFakeSupabase();

    await provisionFixture(supabase, FIXTURE);

    expect(new Set(supabase.records.map((r) => r.citizen_id))).toEqual(new Set([CITIZEN_ID]));
  });

  it('marks every record simulated', async () => {
    const supabase = createFakeSupabase();

    await provisionFixture(supabase, FIXTURE);

    expect(supabase.records.every((r) => r.is_simulated === true)).toBe(true);
  });

  it('leaves the bank record without a department', async () => {
    const supabase = createFakeSupabase();

    await provisionFixture(supabase, FIXTURE);

    const bank = supabase.records.find((r) => r.record_type === 'BANK_DETAILS');
    expect(bank?.authority_department_id).toBeNull();
  });

  it('stops before writing anything when a field key has no policy', async () => {
    const supabase = createFakeSupabase({
      policyKeys: allPolicyKeys().filter((k) => k.field_key !== 'bankAccountHolder'),
    });

    await expect(provisionFixture(supabase, FIXTURE)).rejects.toThrow(/field_policies/);
    expect(supabase.records).toHaveLength(0);
    expect(supabase.fields).toHaveLength(0);
  });

  it('refuses when the Phase 2 routing rows are absent', async () => {
    const supabase = createFakeSupabase();
    const original = supabase.from.bind(supabase);
    supabase.from = (table: string) =>
      table === 'data_sources'
        ? { select: () => ({ in: async () => ({ data: [], error: null }) }) }
        : original(table);

    await expect(resolveRouting(supabase)).rejects.toThrow(/apply the Phase 2 migration/);
  });
});

describe('credential and secret handling', () => {
  it('declares no password variable of any kind', () => {
    // This script provisions records for an account that already exists; it
    // never authenticates as anybody, so it has no reason to touch a password.
    for (const fixture of RECORD_FIXTURES) {
      expect(fixture).not.toHaveProperty('passwordVar');
      expect(fixture).not.toHaveProperty('password');
    }
  });

  it('returns no credential, token or secret from a provisioning run', async () => {
    const supabase = createFakeSupabase();

    const { profile, results } = await provisionFixture(supabase, FIXTURE);

    const serialized = JSON.stringify({ profile, results });
    expect(serialized).not.toMatch(/password|token|secret|service_role|apikey/i);
  });

  it('prints nothing during provisioning — output is the caller\'s choice', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await provisionFixture(createFakeSupabase(), FIXTURE);

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });
});
