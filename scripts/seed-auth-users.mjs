#!/usr/bin/env node
/**
 * Creates the synthetic development accounts Phase 3 needs to demonstrate both
 * authentication flows: one CITIZEN and one GOVERNMENT_OFFICER.
 *
 * Every account is fictional. No real personal or government data is used, and
 * no password is stored in this repository — passwords are read from the
 * environment, so running this script is what puts them on a machine, not
 * cloning the repo (Phase 3 §42).
 *
 * Usage:
 *   SETUX_SEED_CITIZEN_PASSWORD=... SETUX_SEED_OFFICER_PASSWORD=... \
 *     node scripts/seed-auth-users.mjs
 *
 * The script is idempotent: an account that already exists has its SetuX
 * profile reconciled rather than being duplicated.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

/** Reads `backend/.env` so the script works without an exported environment. */
function loadBackendEnv() {
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

const fileEnv = loadBackendEnv();
const SUPABASE_URL = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('Set them in backend/.env or in the environment.');
  process.exit(1);
}

/**
 * The accounts to provision.
 *
 * The officer's role is set here, server-side, rather than being selectable at
 * sign-up: government access must be provisioned through a controlled process
 * (auth-api.md §11, authentication-and-rbac.md §16).
 */
const ACCOUNTS = [
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

const missingPasswords = ACCOUNTS.filter((account) => !process.env[account.passwordVar]);

if (missingPasswords.length > 0) {
  console.error('Missing password environment variables:');
  for (const account of missingPasswords) {
    console.error(`  ${account.passwordVar}  (${account.label} — ${account.email})`);
  }
  console.error('\nChoose your own values; they are never committed.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Finds an existing auth user by email, or null. */
async function findAuthUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Creates the auth identity and its SetuX profile.
 *
 * The profile is written with the service role because `profiles` has no INSERT
 * policy by design — a client must never choose its own role.
 */
async function seedAccount(account) {
  const password = process.env[account.passwordVar];

  let user = await findAuthUserByEmail(account.email);
  let created = false;

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
    created = true;
  }

  // Upsert keeps the script idempotent and repairs a profile whose role drifted.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: account.email,
        role: account.role,
        onboarding_status: 'NOT_STARTED',
      },
      { onConflict: 'id' },
    );

  if (profileError) {
    throw new Error(`Could not write profile for ${account.email}: ${profileError.message}`);
  }

  return { created, id: user.id };
}

try {
  console.log('Seeding SetuX development accounts (synthetic data only)\n');

  for (const account of ACCOUNTS) {
    const { created, id } = await seedAccount(account);
    const action = created ? 'created' : 'updated';
    console.log(`  ${action.padEnd(8)} ${account.role.padEnd(20)} ${account.email}  (${id})`);
  }

  console.log('\nDone. Sign in at http://localhost:5173/login');
  console.log('Passwords are the ones you supplied in the environment.');
} catch (error) {
  console.error(`\nSeeding failed: ${error.message}`);
  process.exit(1);
}
