import { defineConfig } from 'vitest/config';

// Unit tests only — no database, no server, nothing that ever needs to touch
// Prisma. Deliberately the default config so a bare `vitest`/`npm test` can
// never trigger a database reset. See vitest.integration.config.mjs for that.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
});
