import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TEST_DB_URL, TEST_PORT, TEST_SESSION_SECRET, BASE_URL, FIXTURE, TEST_PASSWORD } from './config.js';

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const nextCli = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * Runs once for the whole suite: resets a dedicated test database, seeds the
 * bare minimum every test can build on, and starts the real server against it
 * — the same route handlers a browser hits, not a mock of them. Individual
 * test files create whatever people/tasks/entries they need through the API,
 * the same way a user would.
 */
export default async function setup() {
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--force-reset', '--skip-generate'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });

  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  try {
    await prisma.settings.create({ data: { id: 1 } });
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WorkSession_userId_open_key" ON "WorkSession" ("userId") WHERE "endedAt" IS NULL`,
    );

    const steps = [];
    for (const [i, title] of ['Read the handbook', 'Set up two-factor'].entries()) {
      steps.push(await prisma.onboardingStep.create({ data: { title, order: i + 1 } }));
    }

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const ceo = await prisma.user.create({
      data: { name: FIXTURE.ceo.name, email: FIXTURE.ceo.email, passwordHash, role: 'CEO' },
    });
    await prisma.onboardingProgress.createMany({
      data: steps.map((s) => ({ userId: ceo.id, stepId: s.id })),
    });
  } finally {
    await prisma.$disconnect();
  }

  // Clear anything left listening on the test port by a previous crashed run.
  try {
    execFileSync('fuser', ['-k', `${TEST_PORT}/tcp`], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    /* nothing was listening — fine */
  }

  // Dev mode, not a production build: route handler behaviour is identical
  // either way, and skipping the build keeps the suite fast to iterate on.
  const server = spawn(process.execPath, [nextCli, 'dev', '-p', String(TEST_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB_URL,
      SESSION_SECRET: TEST_SESSION_SECRET,
      CRON_SECRET: 'test-cron-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // its own process group, so teardown can kill Next's worker processes too
  });

  let serverOutput = '';
  server.stdout.on('data', (d) => {
    serverOutput += d.toString();
  });
  server.stderr.on('data', (d) => {
    serverOutput += d.toString();
  });
  server.on('error', (err) => {
    serverOutput += `\nspawn error: ${err.message}`;
  });

  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/login`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!ready) {
    console.error(serverOutput);
    throw new Error(`Test server never answered on ${BASE_URL}`);
  }

  return async function teardown() {
    if (!server.pid) return;
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 800));
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
}
