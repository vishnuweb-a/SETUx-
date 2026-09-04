import { describe, expect, it } from 'vitest';

/**
 * `scripts/seed-auth-users.mjs` provisions the two synthetic development
 * fixtures. It is development tooling, but it writes to `profiles` with the
 * service role, so the blast radius of a mistake is real: an earlier version
 * upserted `onboarding_status: 'NOT_STARTED'` on every run and silently sent
 * already-onboarded fixtures back to the start of the flow.
 *
 * The properties pinned here are the ones that made that regression possible:
 *
 *   - `--only` selects a *known* fixture and refuses anything else, so the
 *     script can never be pointed at a real account;
 *   - only the selected fixture's password is required;
 *   - an existing profile keeps its onboarding progress — the script writes
 *     nothing but the fields it owns;
 *   - `NOT_STARTED` is an initial value for a new profile, never a reset.
 *
 * No live database is involved: the Supabase client is faked in memory, and
 * every address used here is a synthetic `.test` fixture.
 */

// @ts-expect-error — plain-JS operational script, intentionally untyped.
const seeder = await import('../../../scripts/seed-auth-users.mjs');

const { ACCOUNTS, selectAccounts, missingPasswordVars, seedAccount } = seeder as {
  ACCOUNTS: SeedAccount[];
  selectAccounts: (argv: string[], accounts?: SeedAccount[]) => SeedAccount[];
  missingPasswordVars: (
    accounts: SeedAccount[],
    env: Record<string, string | undefined>,
  ) => SeedAccount[];
  seedAccount: (
    supabase: unknown,
    account: SeedAccount,
    env: Record<string, string | undefined>,
  ) => Promise<SeedResult>;
};

interface SeedAccount {
  label: string;
  email: string;
  role: string;
  passwordVar: string;
}

interface SeedResult {
  id: string;
  createdIdentity: boolean;
  createdProfile: boolean;
  roleRepaired: boolean;
  onboardingStatus: string;
}

interface FakeProfile {
  id: string;
  email: string;
  role: string;
  onboarding_status: string;
  [key: string]: unknown;
}

const CITIZEN = ACCOUNTS.find((account) => account.email === 'citizen@setux.test')!;
const OFFICER = ACCOUNTS.find((account) => account.email === 'officer@setux.test')!;

/**
 * A minimal stand-in for the service-role client: enough of `auth.admin` and
 * the `profiles` query builder for the script's two write paths, and a record
 * of what it was asked to do.
 */
function createFakeSupabase(options: {
  users?: { id: string; email: string }[];
  profiles?: FakeProfile[];
}) {
  const users = [...(options.users ?? [])];
  const profiles = [...(options.profiles ?? [])];
  const passwordUpdates: { id: string; hasPassword: boolean }[] = [];
  const profileInserts: Record<string, unknown>[] = [];
  const profileUpdates: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        updateUserById: async (id: string, attributes: { password?: string }) => {
          passwordUpdates.push({ id, hasPassword: Boolean(attributes.password) });
          return { data: { user: users.find((user) => user.id === id) }, error: null };
        },
        createUser: async (attributes: { email: string }) => {
          const user = { id: `generated-${attributes.email}`, email: attributes.email };
          users.push(user);
          return { data: { user }, error: null };
        },
      },
    },
    from(table: string) {
      if (table !== 'profiles') throw new Error(`Unexpected table: ${table}`);

      return {
        select: () => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async () => ({
              data: profiles.find((profile) => profile.id === value) ?? null,
              error: null,
            }),
          }),
        }),
        insert: async (row: FakeProfile) => {
          profileInserts.push(row);
          profiles.push(row);
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_column: string, value: string) => {
            profileUpdates.push(patch);
            const profile = profiles.find((candidate) => candidate.id === value);
            if (profile) Object.assign(profile, patch);
            return { error: null };
          },
        }),
      };
    },
  };

  return { supabase, profiles, passwordUpdates, profileInserts, profileUpdates };
}

describe('seed-auth-users: account selection', () => {
  it('processes both documented fixtures when --only is absent (case D)', () => {
    const selected = selectAccounts([]);

    expect(selected).toHaveLength(2);
    expect(selected.map((account) => account.email)).toEqual([
      'citizen@setux.test',
      'officer@setux.test',
    ]);
  });

  it('narrows to the citizen fixture', () => {
    expect(selectAccounts(['--only', 'citizen@setux.test'])).toEqual([CITIZEN]);
  });

  it('narrows to the officer fixture', () => {
    expect(selectAccounts(['--only', 'officer@setux.test'])).toEqual([OFFICER]);
  });

  it('matches the fixture address case-insensitively', () => {
    expect(selectAccounts(['--only', 'Citizen@SetuX.test'])).toEqual([CITIZEN]);
  });

  it('refuses an address that is not a synthetic fixture (case E)', () => {
    // The security property: --only picks from a known list, it does not name
    // an arbitrary user. A real address must never be reachable.
    expect(() => selectAccounts(['--only', 'someone@example.com'])).toThrow(/refusing to target/);
  });

  it('refuses --only without a value', () => {
    expect(() => selectAccounts(['--only'])).toThrow(/requires an email address/);
    expect(() => selectAccounts(['--only', '--verbose'])).toThrow(/requires an email address/);
  });
});

describe('seed-auth-users: password requirements', () => {
  it('requires only the selected account password (case F)', () => {
    const citizenOnly = selectAccounts(['--only', 'citizen@setux.test']);

    // The citizen password alone is enough for the citizen.
    expect(missingPasswordVars(citizenOnly, { SETUX_SEED_CITIZEN_PASSWORD: 'x' })).toEqual([]);

    // ...and its absence is reported, so the run fails before touching anything.
    expect(missingPasswordVars(citizenOnly, {})).toEqual([CITIZEN]);

    // The officer's password is irrelevant to a citizen-only run.
    expect(missingPasswordVars(citizenOnly, { SETUX_SEED_OFFICER_PASSWORD: 'x' })).toEqual([
      CITIZEN,
    ]);
  });

  it('requires only the officer password for an officer-only run', () => {
    const officerOnly = selectAccounts(['--only', 'officer@setux.test']);

    expect(missingPasswordVars(officerOnly, { SETUX_SEED_OFFICER_PASSWORD: 'x' })).toEqual([]);
    expect(missingPasswordVars(officerOnly, { SETUX_SEED_CITIZEN_PASSWORD: 'x' })).toEqual([
      OFFICER,
    ]);
  });

  it('still requires both passwords when no --only is supplied', () => {
    const both = selectAccounts([]);

    expect(missingPasswordVars(both, {})).toHaveLength(2);
    expect(missingPasswordVars(both, { SETUX_SEED_CITIZEN_PASSWORD: 'x' })).toEqual([OFFICER]);
  });
});

describe('seed-auth-users: onboarding state', () => {
  it('preserves an existing citizen COMPLETED status while rotating the password (case A)', async () => {
    const fake = createFakeSupabase({
      users: [{ id: 'citizen-1', email: 'citizen@setux.test' }],
      profiles: [
        {
          id: 'citizen-1',
          email: 'citizen@setux.test',
          role: 'CITIZEN',
          onboarding_status: 'COMPLETED',
        },
      ],
    });

    const result = await seedAccount(fake.supabase, CITIZEN, {
      SETUX_SEED_CITIZEN_PASSWORD: 'synthetic-fixture-password',
    });

    expect(fake.passwordUpdates).toEqual([{ id: 'citizen-1', hasPassword: true }]);
    expect(result.createdProfile).toBe(false);
    expect(result.onboardingStatus).toBe('COMPLETED');

    // The regression this test exists for: the stored status is untouched...
    expect(fake.profiles[0]?.onboarding_status).toBe('COMPLETED');
    expect(fake.profiles[0]?.role).toBe('CITIZEN');

    // ...because no write mentioned it at all.
    expect(fake.profileInserts).toEqual([]);
    expect(fake.profileUpdates).toEqual([]);
  });

  it('preserves an existing officer COMPLETED status while rotating the password (case B)', async () => {
    const fake = createFakeSupabase({
      users: [{ id: 'officer-1', email: 'officer@setux.test' }],
      profiles: [
        {
          id: 'officer-1',
          email: 'officer@setux.test',
          role: 'GOVERNMENT_OFFICER',
          onboarding_status: 'COMPLETED',
        },
      ],
    });

    const result = await seedAccount(fake.supabase, OFFICER, {
      SETUX_SEED_OFFICER_PASSWORD: 'synthetic-fixture-password',
    });

    expect(fake.passwordUpdates).toEqual([{ id: 'officer-1', hasPassword: true }]);
    expect(result.onboardingStatus).toBe('COMPLETED');
    expect(fake.profiles[0]?.onboarding_status).toBe('COMPLETED');
    expect(fake.profiles[0]?.role).toBe('GOVERNMENT_OFFICER');
    expect(fake.profileUpdates).toEqual([]);
  });

  it('preserves an in-progress status too — not just COMPLETED', async () => {
    const fake = createFakeSupabase({
      users: [{ id: 'citizen-1', email: 'citizen@setux.test' }],
      profiles: [
        {
          id: 'citizen-1',
          email: 'citizen@setux.test',
          role: 'CITIZEN',
          onboarding_status: 'IN_PROGRESS',
        },
      ],
    });

    const result = await seedAccount(fake.supabase, CITIZEN, {
      SETUX_SEED_CITIZEN_PASSWORD: 'synthetic-fixture-password',
    });

    expect(result.onboardingStatus).toBe('IN_PROGRESS');
    expect(fake.profiles[0]?.onboarding_status).toBe('IN_PROGRESS');
  });

  it('creates a new synthetic profile with NOT_STARTED (case C)', async () => {
    const fake = createFakeSupabase({ users: [], profiles: [] });

    const result = await seedAccount(fake.supabase, CITIZEN, {
      SETUX_SEED_CITIZEN_PASSWORD: 'synthetic-fixture-password',
    });

    expect(result.createdIdentity).toBe(true);
    expect(result.createdProfile).toBe(true);
    expect(fake.profileInserts).toEqual([
      {
        id: 'generated-citizen@setux.test',
        email: 'citizen@setux.test',
        role: 'CITIZEN',
        onboarding_status: 'NOT_STARTED',
      },
    ]);
  });

  it('repairs a drifted role without touching onboarding state', async () => {
    // Role reconciliation is the seeder's documented job — government access
    // is provisioned here, not chosen at sign-up. It stays, narrowed to the
    // single field it owns.
    const fake = createFakeSupabase({
      users: [{ id: 'officer-1', email: 'officer@setux.test' }],
      profiles: [
        {
          id: 'officer-1',
          email: 'officer@setux.test',
          role: 'CITIZEN',
          onboarding_status: 'COMPLETED',
        },
      ],
    });

    const result = await seedAccount(fake.supabase, OFFICER, {
      SETUX_SEED_OFFICER_PASSWORD: 'synthetic-fixture-password',
    });

    expect(result.roleRepaired).toBe(true);
    expect(fake.profileUpdates).toEqual([{ role: 'GOVERNMENT_OFFICER' }]);
    expect(fake.profiles[0]?.onboarding_status).toBe('COMPLETED');
  });

  it('leaves the other fixture untouched when one is selected (cases A and B)', async () => {
    const fake = createFakeSupabase({
      users: [
        { id: 'citizen-1', email: 'citizen@setux.test' },
        { id: 'officer-1', email: 'officer@setux.test' },
      ],
      profiles: [
        {
          id: 'citizen-1',
          email: 'citizen@setux.test',
          role: 'CITIZEN',
          onboarding_status: 'COMPLETED',
        },
        {
          id: 'officer-1',
          email: 'officer@setux.test',
          role: 'GOVERNMENT_OFFICER',
          onboarding_status: 'COMPLETED',
        },
      ],
    });

    for (const account of selectAccounts(['--only', 'citizen@setux.test'])) {
      await seedAccount(fake.supabase, account, {
        SETUX_SEED_CITIZEN_PASSWORD: 'synthetic-fixture-password',
      });
    }

    // The officer's password was never rotated and its profile never written.
    expect(fake.passwordUpdates.map((update) => update.id)).toEqual(['citizen-1']);
    expect(fake.profiles[1]).toEqual({
      id: 'officer-1',
      email: 'officer@setux.test',
      role: 'GOVERNMENT_OFFICER',
      onboarding_status: 'COMPLETED',
    });
  });
});
