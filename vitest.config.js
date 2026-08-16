import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/integration/global-setup.js'],
    // Integration tests share one Postgres database and one running server —
    // parallel files would step on each other's data (task caps, leave
    // balances, the works). The suite is small enough that serial costs nothing.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
