#!/usr/bin/env node
/**
 * Warns, at frontend start-up, when no SetuX backend is reachable.
 *
 * This exists because of a specific, repeated failure: starting only the
 * frontend produces an app that looks completely healthy until the first sign-in
 * or registration, which then fails with a browser network error that names
 * nothing useful. The backend being absent is invisible until precisely the
 * moment it is most confusing.
 *
 * It never fails the build. Running the frontend alone is legitimate (UI work,
 * a deployed API); the point is to say so out loud, once, at the top of the log.
 *
 * Usage: node scripts/check-backend.mjs [origin]
 */
const origin = process.argv[2] ?? process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:3000';
const url = `${origin.replace(/\/$/, '')}/api/v1/health`;

const yellow = (text) => `[33m${text}[39m`;
const green = (text) => `[32m${text}[39m`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const body = await response.json();

  if (response.ok && body?.success === true) {
    console.log(green(`✔ SetuX backend reachable at ${origin} (${body.data.status})`));
  } else {
    console.warn(
      yellow(`⚠ SetuX backend at ${origin} answered ${response.status}. Sign-in may fail.`),
    );
  }
} catch {
  console.warn(
    yellow(
      [
        '',
        '⚠  No SetuX backend is running.',
        '',
        `   Nothing is answering ${url}.`,
        '   The app will load, but sign-in and registration will fail with',
        '   "Could not reach the SetuX server".',
        '',
        '   Start both servers together from the repository root:',
        '',
        '     npm run dev',
        '',
        '   Or start the backend on its own, in a second terminal:',
        '',
        '     npm run dev:backend',
        '',
      ].join('\n'),
    ),
  );
}
