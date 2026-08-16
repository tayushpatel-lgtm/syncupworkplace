import { defineConfig } from 'vitest/config';

// Integration tests spin up a real server against a dedicated test database
// (tests/integration/global-setup.js) and drive it over HTTP — the same
// route handlers a browser hits, not a mock of them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    globalSetup: ['./tests/integration/global-setup.js'],
    // One shared database and one running server — parallel files would step
    // on each other's data (task caps, leave balances, the works). The suite
    // is small enough that serial costs nothing.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
