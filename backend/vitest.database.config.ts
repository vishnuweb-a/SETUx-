import { defineConfig } from 'vitest/config';

/**
 * Integration tests that talk to a real Supabase project.
 *
 * Kept out of the default `npm test` run so the normal suite needs no network
 * access and no credentials. These tests read their connection details from the
 * ambient environment — never from a committed file — and skip themselves
 * entirely unless `SETUX_DB_TESTS=1`:
 *
 *   SETUX_DB_TESTS=1 \
 *   SETUX_TEST_SUPABASE_URL=... \
 *   SETUX_TEST_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run test:db -w backend
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/database/**/*.test.ts'],
    // Real network round-trips are slower than the unit-test default.
    testTimeout: 30_000,
    env: { NODE_ENV: 'test' },
  },
});
