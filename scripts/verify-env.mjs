#!/usr/bin/env node
/**
 * Checks that the local environment files a developer needs actually exist,
 * and that no privileged secret has leaked into a browser-visible file.
 *
 * Usage: node scripts/verify-env.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const problems = [];
const notes = [];

const required = [
  ['backend/.env', 'backend/.env.example'],
  ['frontend/.env', 'frontend/.env.example'],
];

for (const [target, example] of required) {
  if (!existsSync(join(root, target))) {
    notes.push(`${target} is missing — copy it from ${example}`);
  }
}

// A service-role key is privileged and must never be exposed to the browser.
const frontendEnv = join(root, 'frontend/.env');
if (existsSync(frontendEnv)) {
  const contents = readFileSync(frontendEnv, 'utf8');
  if (/SERVICE_ROLE/i.test(contents)) {
    problems.push('frontend/.env references a SERVICE_ROLE key. Remove it — it must stay server-side.');
  }
}

for (const note of notes) console.log(`  note: ${note}`);
for (const problem of problems) console.error(`  FAIL: ${problem}`);

if (problems.length > 0) {
  console.error(`\nEnvironment check failed with ${problems.length} problem(s).`);
  process.exit(1);
}

console.log(notes.length === 0 ? 'Environment check passed.' : '\nEnvironment check passed with notes.');
