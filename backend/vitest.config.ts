import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Live-database tests need real credentials and network access; they run
    // via `npm run test:db` with vitest.database.config.ts instead.
    exclude: ['tests/database/**'],
    env: {
      NODE_ENV: 'test',
      // Placeholders that satisfy environment validation without contacting a
      // real project. Unit and integration tests stub the database layer; tests
      // that need a live database opt in explicitly (see tests/database/).
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-credential',
    },
  },
});
