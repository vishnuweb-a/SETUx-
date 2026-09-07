#!/usr/bin/env node
/**
 * Provisions the synthetic government records the Change & Correction Service
 * demo needs, for ONE known synthetic fixture citizen.
 *
 * Every value written here is fictional. No real Aadhaar, PAN, IFSC, account,
 * certificate, institution or person appears anywhere in this file — the
 * identifiers are `SYNTH-`/`SETUX-DEMO` prefixed, the account number is masked,
 * and every institution name carries "(Simulated)" or "Demo".
 *
 * Usage:
 *   node scripts/seed-change-correction-demo.mjs
 *   node scripts/seed-change-correction-demo.mjs --only citizen@setux.test
 *
 * WHY A SEPARATE SCRIPT (arch §21, task §14).
 *
 * `seed-auth-users.mjs` provisions AUTH IDENTITIES — auth users and profiles.
 * This provisions DOMAIN DATA for a citizen that already exists. Folding
 * records into that script would give a password-rotation run a reason to write
 * government records, and would mean the two concerns share one blast radius.
 * They are separate, they compose (auth seeder first, this second), and each
 * stays narrow.
 *
 * It is emphatically NOT auto-provisioning on login or onboarding (arch §21
 * rejects that Option C): every real citizen completing onboarding would then
 * silently receive synthetic government records. Demo fixture behaviour must be
 * explicit, opt-in, and run by a human.
 *
 * SAFETY PROPERTIES, inherited from `seed-auth-users.mjs` and preserved here:
 *
 *   - `--only` accepts NOTHING but the known synthetic fixture address, so the
 *     script cannot be aimed at a real account;
 *   - it looks the citizen up by email and REFUSES to create one — if the
 *     fixture is absent, it tells you to run the auth seeder rather than
 *     inventing an account;
 *   - it refuses to write to an account that is not a CITIZEN;
 *   - it NEVER writes `profiles.role` and NEVER writes
 *     `profiles.onboarding_status`, so an onboarded fixture cannot be sent back
 *     to the start and a role cannot drift (the regression `seed-auth-users`
 *     was hardened against);
 *   - it prints no password, no token and no credential of any kind;
 *   - it touches no other user, no application, and no `application_data` row.
 *
 * IDEMPOTENT (arch §22). Every write is an upsert on the table's own unique
 * key — `(citizen_id, record_type, data_source_id)` for a record and
 * `(citizen_record_id, field_key)` for a value — so running it twice produces
 * exactly the state of running it once.
 *
 * PHASE BOUNDARY. This script writes source-record INVENTORY only. It creates
 * no change request, no proposed value, no dependency rule, no consent, no
 * review and no notification, and it calls no connector. Those are Phase 3 and
 * later.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The synthetic holder name every record currently carries.
 *
 * The point of one shared value across five records held by four different
 * authorities is the dependency demo (arch §23): a single correction to the
 * identity record is what later expands into four targets. If the records
 * disagreed on the current name, that demo would have nothing to propagate.
 *
 * A neutral placeholder rather than a real-looking personal name, matching the
 * repository's existing connector fixtures — nothing in a screenshot should
 * resemble a real person (arch §23).
 *
 * NOTE: this is the name the SOURCE SYSTEMS hold, which is a different thing
 * from the citizen's SetuX onboarding profile name. The two are allowed to
 * differ — a mismatch between what a citizen told SetuX and what a government
 * source holds is precisely the situation this feature exists to correct. This
 * script therefore never touches `citizen_profiles`.
 */
export const DEMO_HOLDER_NAME = 'Demo Old Name';

/** Synthetic address, shared by the identity and income records. */
const DEMO_ADDRESS = 'Demo House 12, Demo Sector 7, Demo City';

/** Synthetic 10-digit mobile, valid for the schema's `^[6-9]\d{9}$` shape. */
const DEMO_MOBILE = '9000000001';

/**
 * The fixture accounts this script is allowed to provision records for.
 *
 * Same shape and same rule as `seed-auth-users.mjs`: an address not in this
 * list is refused rather than ignored.
 */
export const RECORD_FIXTURES = [
  { label: 'Citizen', email: 'citizen@setux.test', role: 'CITIZEN' },
];

/**
 * The five synthetic records, and the authority/source each is routed to
 * (arch §20.5, §20.6).
 *
 * `authorityDepartmentCode` is `null` for BANK_DETAILS on purpose: the bank is
 * a PROVIDER, not a department. It has no officer queue and never will, so
 * fabricating a department row for it would invent a government office that
 * does not exist (arch §20.6, §8.1).
 *
 * Every `fieldKey` below must exist in `field_policies` — the provisioner
 * verifies this at runtime and refuses to write a field no policy governs,
 * rather than silently creating a value the change form can never explain.
 */
export const DEMO_RECORDS = [
  {
    recordType: 'IDENTITY_RECORD',
    dataSourceCode: 'MOCK_IDENTITY_API',
    authorityDepartmentCode: 'IDENTITY_AUTHORITY',
    sourceRecordRef: 'SYNTH-IDR-2026-0117',
    sourceVersion: 'v1',
    fields: {
      identityHolderName: DEMO_HOLDER_NAME,
      identityBirthYear: 2004,
      identityMobile: DEMO_MOBILE,
      identityAddress: DEMO_ADDRESS,
      identityRegistryReference: 'SYNTH-IDR-2026-0117',
      identityRecordStatus: 'ACTIVE',
    },
  },
  {
    recordType: 'INCOME_RECORD',
    dataSourceCode: 'MOCK_INCOME_API',
    authorityDepartmentCode: 'REVENUE_DEPT',
    sourceRecordRef: 'SYNTH-INC-2026-008812',
    sourceVersion: 'v1',
    fields: {
      incomeCertificateHolder: DEMO_HOLDER_NAME,
      incomeAddress: DEMO_ADDRESS,
      incomeBand: 'BELOW_THRESHOLD',
      incomeCertificateNumber: 'SYNTH-INC-2026-008812',
      incomeIssuingOffice: 'Demo Tehsil Revenue Office (Simulated)',
      incomeAssessmentYear: '2025-2026',
      incomeValidUntil: '2027-03-31',
    },
  },
  {
    recordType: 'EDUCATION_RECORD',
    dataSourceCode: 'MOCK_EDUCATION_API',
    authorityDepartmentCode: 'HIGHER_ED',
    sourceRecordRef: 'SYNTH-EDU-2026-004417',
    sourceVersion: 'v1',
    fields: {
      educationStudentName: DEMO_HOLDER_NAME,
      educationEnrolmentNumber: 'SYNTH-EDU-2026-004417',
      educationInstitution: 'Demo Institute of Technology (Simulated)',
      educationAggregatePercentage: 82.4,
      educationBoard: 'Demo State Board (Simulated)',
      educationResultYear: '2026',
      educationEnrolmentStatus: 'ENROLLED',
    },
  },
  {
    recordType: 'COMMUNITY_RECORD',
    dataSourceCode: 'DIGILOCKER_MOCK',
    authorityDepartmentCode: 'MINORITY_AFFAIRS',
    sourceRecordRef: 'SYNTH-COM-2026-002293',
    sourceVersion: 'v1',
    fields: {
      communityCertificateHolder: DEMO_HOLDER_NAME,
      communityCategory: 'Demo Category B',
      communityCertificateNumber: 'SYNTH-COM-2026-002293',
      communityIssuingOffice: 'Demo District Authority (Simulated)',
    },
  },
  {
    recordType: 'BANK_DETAILS',
    dataSourceCode: 'MOCK_BANK_API',
    // A provider, not a department (arch §20.6, §8.1).
    authorityDepartmentCode: null,
    sourceRecordRef: 'SYNTH-BNK-2026-004409',
    sourceVersion: 'v1',
    fields: {
      bankAccountHolder: DEMO_HOLDER_NAME,
      // Masked, and never a real account number.
      bankAccountMasked: 'XXXXXX4409',
      bankBranchCode: 'SYNTHBR0001',
      bankBranchName: 'Demo Public Bank, Demo City Branch (Simulated)',
      bankAccountStatus: 'ACTIVE',
    },
  },
];

/**
 * Resolves `--only <email>` against the fixture list.
 *
 * Identical rule to `seed-auth-users.mjs`: an unrecognised address is refused,
 * because `--only` selects a subset of KNOWN fixtures rather than naming an
 * arbitrary user.
 */
export function selectFixtures(argv, fixtures = RECORD_FIXTURES) {
  const index = argv.indexOf('--only');
  if (index === -1) return fixtures;

  const target = argv[index + 1];
  if (!target || target.startsWith('--')) {
    throw new Error('--only requires an email address.');
  }

  const match = fixtures.find((f) => f.email.toLowerCase() === target.toLowerCase());

  if (!match) {
    const known = fixtures.map((f) => f.email).join(', ');
    throw new Error(
      `--only accepts a synthetic fixture address (${known}); refusing to target "${target}".`,
    );
  }

  return [match];
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

/**
 * Every field key the fixture intends to write, deduplicated.
 *
 * Exported so a test can assert the fixture's vocabulary against the policy
 * table without re-deriving it.
 */
export function fixtureFieldKeys(records = DEMO_RECORDS) {
  return [...new Set(records.flatMap((record) => Object.keys(record.fields)))].sort();
}

/**
 * Refuses to provision a field no Phase 1 policy governs.
 *
 * This is the check task §17 demands, enforced at runtime rather than trusted:
 * a fixture key that has drifted from `field_policies` would produce a value
 * the change form can render but never explain, and "fix the fixture to match
 * the authoritative key" is only possible if the mismatch is detected. So the
 * whole run stops rather than writing a partially-governed record.
 */
export async function assertFieldKeysMatchPolicies(supabase, records = DEMO_RECORDS) {
  const { data, error } = await supabase.from('field_policies').select('record_type, field_key');
  if (error) throw new Error(`Could not read field policies: ${error.message}`);

  const known = new Set((data ?? []).map((row) => `${row.record_type}.${row.field_key}`));

  const missing = records.flatMap((record) =>
    Object.keys(record.fields)
      .filter((fieldKey) => !known.has(`${record.recordType}.${fieldKey}`))
      .map((fieldKey) => `${record.recordType}.${fieldKey}`),
  );

  if (missing.length > 0) {
    throw new Error(
      `Fixture field keys have no field_policies row: ${missing.join(', ')}. ` +
        'Fix the fixture to match the authoritative Phase 1 key rather than inventing a second key.',
    );
  }

  return known.size;
}

/**
 * Finds the fixture citizen's profile, and refuses anything unexpected.
 *
 * Deliberately does NOT create the profile. Creating auth users belongs to
 * `seed-auth-users.mjs`, and a records script that could conjure an account
 * would be a second path to an identity — exactly the sort of hidden
 * provisioning arch §21 rules out.
 */
export async function findFixtureCitizen(supabase, fixture) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, onboarding_status')
    .eq('email', fixture.email)
    .maybeSingle();

  if (error) throw new Error(`Could not read profile for ${fixture.email}: ${error.message}`);

  if (!data) {
    throw new Error(
      `No profile exists for ${fixture.email}. ` +
        'Run `node scripts/seed-auth-users.mjs --only ' +
        fixture.email +
        '` first, then complete onboarding.',
    );
  }

  if (data.role !== fixture.role) {
    throw new Error(
      `${fixture.email} has role ${data.role}, expected ${fixture.role}; refusing to provision records.`,
    );
  }

  // Records are provisioned for a citizen SetuX can attribute them to. The
  // onboarding status is REPORTED and never written: repairing it here would
  // reintroduce the very regression `seed-auth-users.mjs` was hardened against.
  return data;
}

/**
 * Resolves the source and authority UUIDs the records route to.
 *
 * Looked up by their natural codes rather than hardcoded, because the UUIDs are
 * generated by the migration and would differ between environments.
 */
export async function resolveRouting(supabase, records = DEMO_RECORDS) {
  const sourceCodes = [...new Set(records.map((r) => r.dataSourceCode))];
  const departmentCodes = [
    ...new Set(records.map((r) => r.authorityDepartmentCode).filter(Boolean)),
  ];

  const { data: sources, error: sourceError } = await supabase
    .from('data_sources')
    .select('id, code')
    .in('code', sourceCodes);
  if (sourceError) throw new Error(`Could not read data sources: ${sourceError.message}`);

  const { data: departments, error: departmentError } = await supabase
    .from('departments')
    .select('id, code')
    .in('code', departmentCodes);
  if (departmentError) throw new Error(`Could not read departments: ${departmentError.message}`);

  const sourceByCode = new Map((sources ?? []).map((row) => [row.code, row.id]));
  const departmentByCode = new Map((departments ?? []).map((row) => [row.code, row.id]));

  const missingSources = sourceCodes.filter((code) => !sourceByCode.has(code));
  const missingDepartments = departmentCodes.filter((code) => !departmentByCode.has(code));

  if (missingSources.length > 0 || missingDepartments.length > 0) {
    throw new Error(
      'Routing rows are missing; apply the Phase 2 migration first. ' +
        `Missing sources: [${missingSources.join(', ')}], departments: [${missingDepartments.join(', ')}].`,
    );
  }

  return { sourceByCode, departmentByCode };
}

/**
 * Writes one record and its fields, idempotently.
 *
 * Two upserts, each on the table's own unique key (arch §22):
 *
 *   citizen_records        on (citizen_id, record_type, data_source_id)
 *   citizen_record_fields  on (citizen_record_id, field_key)
 *
 * `on conflict do update` rather than delete-then-insert, so a re-run keeps the
 * record's `id` stable — anything that later references a record by id must not
 * find that id replaced by a re-seed.
 */
export async function provisionRecord(supabase, params) {
  const { citizenId, record, sourceByCode, departmentByCode } = params;

  const { data: recordRow, error: recordError } = await supabase
    .from('citizen_records')
    .upsert(
      {
        citizen_id: citizenId,
        record_type: record.recordType,
        data_source_id: sourceByCode.get(record.dataSourceCode),
        authority_department_id: record.authorityDepartmentCode
          ? departmentByCode.get(record.authorityDepartmentCode)
          : null,
        source_record_ref: record.sourceRecordRef,
        status: 'ACTIVE',
        source_version: record.sourceVersion,
        last_synced_at: new Date().toISOString(),
        // The demo never claims to be real.
        is_simulated: true,
      },
      { onConflict: 'citizen_id,record_type,data_source_id' },
    )
    .select('id')
    .single();

  if (recordError) {
    throw new Error(`Could not provision ${record.recordType}: ${recordError.message}`);
  }

  const fieldRows = Object.entries(record.fields).map(([fieldKey, value]) => ({
    citizen_record_id: recordRow.id,
    field_key: fieldKey,
    field_value: value,
    retrieved_at: new Date().toISOString(),
  }));

  const { error: fieldError } = await supabase
    .from('citizen_record_fields')
    .upsert(fieldRows, { onConflict: 'citizen_record_id,field_key' });

  if (fieldError) {
    throw new Error(`Could not provision ${record.recordType} fields: ${fieldError.message}`);
  }

  return { recordId: recordRow.id, fieldCount: fieldRows.length };
}

/** Provisions the whole five-record inventory for one fixture citizen. */
export async function provisionFixture(supabase, fixture, records = DEMO_RECORDS) {
  const profile = await findFixtureCitizen(supabase, fixture);
  await assertFieldKeysMatchPolicies(supabase, records);
  const { sourceByCode, departmentByCode } = await resolveRouting(supabase, records);

  const results = [];
  for (const record of records) {
    results.push({
      recordType: record.recordType,
      ...(await provisionRecord(supabase, {
        citizenId: profile.id,
        record,
        sourceByCode,
        departmentByCode,
      })),
    });
  }

  return { profile, results };
}

async function main() {
  let fixtures;
  try {
    fixtures = selectFixtures(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
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
    console.log('Provisioning SetuX change & correction demo records (synthetic data only)\n');

    for (const fixture of fixtures) {
      const { profile, results } = await provisionFixture(supabase, fixture);

      console.log(`  ${fixture.email}  (onboarding ${profile.onboarding_status}, preserved)`);
      for (const result of results) {
        console.log(`    ${result.recordType.padEnd(18)} ${result.fieldCount} fields`);
      }
    }

    console.log('\nDone. Records are synthetic and simulated; no source system was contacted.');
  } catch (error) {
    console.error(`\nProvisioning failed: ${error.message}`);
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
