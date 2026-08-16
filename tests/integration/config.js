// Shared between global-setup.js (which starts the fixture) and every test
// file (which talks to it) — one source of truth so they can't drift apart.

export const TEST_PORT = 3311;
export const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
export const TEST_DB_URL = 'postgresql://syncup:syncup@127.0.0.1:5432/syncup_test';
export const TEST_SESSION_SECRET = 'vitest-fixed-session-secret-do-not-use-in-production-0000000';
export const TEST_PASSWORD = 'testpass123';

export const FIXTURE = {
  ceo: { name: 'Fixture CEO', email: 'ceo@fixture.test', role: 'CEO' },
};
