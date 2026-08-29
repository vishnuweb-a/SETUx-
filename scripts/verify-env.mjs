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

/** Returns the decoded payload of a JWT, or null if the value is not one. */
function decodeJwtPayload(value) {
  const segments = value.split('.');
  if (segments.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Parses `KEY=value` lines, skipping blanks and comments. */
function readAssignments(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      if (separator === -1) return null;
      return { name: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    })
    .filter((entry) => entry !== null && entry.value.length > 0);
}

/*
 * A service-role key is privileged and must never reach the browser.
 *
 * Only real assignments are inspected, so the warning comment carried over
 * from .env.example does not trip the check. Both the variable name and its
 * value are examined, because a leaked key is just as dangerous under an
 * innocuous name.
 */
const frontendEnv = join(root, 'frontend/.env');
if (existsSync(frontendEnv)) {
  for (const { name, value } of readAssignments(frontendEnv)) {
    if (/SERVICE_ROLE/i.test(name)) {
      problems.push(
        `frontend/.env assigns ${name}. Remove it — a service-role key must stay server-side.`,
      );
      continue;
    }

    // A Supabase JWT carries its role in the payload; anon is the only role
    // that may ship to a browser.
    const payload = decodeJwtPayload(value);
    if (payload?.role !== undefined && payload.role !== 'anon') {
      problems.push(
        `frontend/.env sets ${name} to a token with role "${payload.role}". Only an anon key may reach the browser.`,
      );
    }
  }
}

for (const note of notes) console.log(`  note: ${note}`);
for (const problem of problems) console.error(`  FAIL: ${problem}`);

if (problems.length > 0) {
  console.error(`\nEnvironment check failed with ${problems.length} problem(s).`);
  process.exit(1);
}

console.log(notes.length === 0 ? 'Environment check passed.' : '\nEnvironment check passed with notes.');
