#!/usr/bin/env node
/**
 * Creates the synthetic development accounts SetuX needs to demonstrate both
 * authentication flows: one CITIZEN and one GOVERNMENT_OFFICER.
 *
 * Every account is fictional. No real personal or government data is used, and
 * no password is stored in this repository — passwords are read from the
 * environment, so running this script is what puts them on a machine, not
 * cloning the repo (Phase 3 §42).
 *
 * Usage:
 *   # both synthetic fixtures
 *   SETUX_SEED_CITIZEN_PASSWORD=... SETUX_SEED_OFFICER_PASSWORD=... \
 *     node scripts/seed-auth-users.mjs
 *
 *   # one fixture only — just that account's password is required
 *   SETUX_SEED_CITIZEN_PASSWORD=... \
 *     node scripts/seed-auth-users.mjs --only citizen@setux.test
 *
 * `--only` accepts nothing but the synthetic fixture addresses below, so the
 * script can never be pointed at a real account.
 *
 * The script is idempotent, and deliberately narrow about what it reconciles:
 * a NEW profile is created with `onboarding_status = NOT_STARTED`, while an
 * EXISTING profile keeps its onboarding progress untouched. Rotating a fixture
 * password must never send an onboarded account back to the start.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The accounts this script is allowed to provision.
 *
 * The officer's role is set here, server-side, rather than being selectable at
 * sign-up: government access must be provisioned through a controlled process
 * (auth-api.md §11, authentication-and-rbac.md §16).
 */
export const ACCOUNTS = [
  {
    label: 'Citizen',
    email: 'citizen@setux.test',
    role: 'CITIZEN',
    passwordVar: 'SETUX_SEED_CITIZEN_PASSWORD',
  },
  {
    label: 'Government officer',
    email: 'officer@setux.test',
    role: 'GOVERNMENT_OFFICER',
    passwordVar: 'SETUX_SEED_OFFICER_PASSWORD',
  },
];

/**
 * Resolves `--only <email>` against the synthetic fixture list.
 *
 * An unrecognised address is refused rather than ignored: `--only` selects a
 * subset of known fixtures, it is not a way to name an arbitrary user.
 */
export function selectAccounts(argv, accounts = ACCOUNTS) {
  const index = argv.indexOf('--only');
  if (index === -1) return accounts;

  const target = argv[index + 1];
  if (!target || target.startsWith('--')) {
    throw new Error('--only requires an email address.');
  }

  const match = accounts.find((account) => account.email.toLowerCase() === target.toLowerCase());

  if (!match) {
    const known = accounts.map((account) => account.email).join(', ');
    throw new Error(
      `--only accepts a synthetic fixture address (${known}); refusing to target "${target}".`,
    );
  }

  return [match];
}

/** Names the password variables missing for the accounts actually selected. */
export function missingPasswordVars(accounts, env) {
  return accounts.filter((account) => !env[account.passwordVar]);
}

/** Reads `backend/.env` so the script works without an exported environment. */
function loadBackendEnv(root) {
  const path = join(root, 'backend/.env');
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

/** Finds an existing auth user by email, or null. */
async function findAuthUserByEmail(supabase, email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Creates or reconciles one synthetic fixture: its auth identity, its password
 * and its profile.
 *
 * The profile is written with the service role because `profiles` has no INSERT
 * policy by design — a client must never choose its own role.
 *
 * Writes are split rather than upserted so the two cases stay explicit:
 *
 *   new profile      → INSERT the fixture fields, onboarding_status NOT_STARTED
 *   existing profile → UPDATE only the fixture-owned fields (role), leaving
 *                      onboarding_status and everything else alone
 */
export async function seedAccount(supabase, account, env) {
  const password = env[account.passwordVar];

  let user = await findAuthUserByEmail(supabase, account.email);
  let createdIdentity = false;

  if (user) {
    // Keep the password in step with the environment so a developer who
    // changes it does not end up locked out of an existing account.
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(`Could not update ${account.email}: ${error.message}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      // Confirmed up front: these are local fixtures and there is no inbox to
      // receive a verification mail.
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create ${account.email}: ${error.message}`);

    user = data.user;
    createdIdentity = true;
  }

  const { data: existingProfile, error: readError } = await supabase
    .from('profiles')
    .select('id, role, onboarding_status')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read profile for ${account.email}: ${readError.message}`);
  }

  if (!existingProfile) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: account.email,
      role: account.role,
      onboarding_status: 'NOT_STARTED',
    });

    if (insertError) {
      throw new Error(`Could not create profile for ${account.email}: ${insertError.message}`);
    }

    return {
      id: user.id,
      createdIdentity,
      createdProfile: true,
      roleRepaired: false,
      onboardingStatus: 'NOT_STARTED',
    };
  }

  // Only the role is fixture-owned on an existing profile. Onboarding progress
  // belongs to the account, not to this script, so it is never written here.
  const roleRepaired = existingProfile.role !== account.role;

  if (roleRepaired) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: account.role })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Could not reconcile role for ${account.email}: ${updateError.message}`);
    }
  }

  return {
    id: user.id,
    createdIdentity,
    createdProfile: false,
    roleRepaired,
    onboardingStatus: existingProfile.onboarding_status,
  };
}

async function main() {
  let accounts;
  try {
    accounts = selectAccounts(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  // Only the selected fixtures' passwords are required: seeding the citizen
  // must not demand the officer's password.
  const missing = missingPasswordVars(accounts, process.env);
  if (missing.length > 0) {
    console.error('Missing password environment variables:');
    for (const account of missing) {
      console.error(`  ${account.passwordVar}  (${account.label} — ${account.email})`);
    }
    console.error('\nChoose your own values; they are never committed.');
    process.exit(1);
  }

  const fileEnv = loadBackendEnv(process.cwd());
  const SUPABASE_URL = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL;
  const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.error('Set them in backend/.env or in the environment.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    console.log('Seeding SetuX development accounts (synthetic data only)\n');

    for (const account of accounts) {
      const result = await seedAccount(supabase, account, process.env);
      const action = result.createdProfile ? 'created' : 'reconciled';
      const note = result.createdProfile
        ? 'onboarding NOT_STARTED'
        : `onboarding ${result.onboardingStatus} (preserved)` +
          (result.roleRepaired ? ', role repaired' : '');

      console.log(
        `  ${action.padEnd(10)} ${account.role.padEnd(20)} ${account.email}  (${result.id})  ${note}`,
      );
    }

    console.log('\nDone. Sign in at http://localhost:5173/login');
    console.log('Passwords are the ones you supplied in the environment.');
  } catch (error) {
    console.error(`\nSeeding failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Run only when invoked directly, so tests can import the pieces above.
 * `pathToFileURL` rather than string concatenation: on Windows `argv[1]` is a
 * drive path, which does not form a file:// URL by prefixing.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
