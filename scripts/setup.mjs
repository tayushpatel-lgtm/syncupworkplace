#!/usr/bin/env node
// One command to go from a fresh clone to a running app: writes .env with a real
// secret, checks the database answers, creates the tables and loads demo data.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, platform } from 'node:process';

const ENV_PATH = '.env';
const PLACEHOLDER = /^(|postgresql:\/\/user:password@host:5432\/syncup|change-me.*)$/;

const say = (msg) => console.log(msg);
const step = (msg) => console.log(`\n[1m${msg}[0m`);
const ok = (msg) => console.log(`  [32m✓[0m ${msg}`);
const warn = (msg) => console.log(`  [33m![0m ${msg}`);

function run(command, quiet = false) {
  return execSync(command, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function readEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function writeEnv(values) {
  const body = [
    '# Postgres. On Vercel, use Neon/Supabase and paste the pooled connection string.',
    `DATABASE_URL="${values.DATABASE_URL}"`,
    '',
    '# Signs the session cookie. Changing it signs everyone out.',
    `SESSION_SECRET="${values.SESSION_SECRET}"`,
    '',
    '# The company timezone. Every day boundary and attendance figure is read in it.',
    `APP_TIMEZONE="${values.APP_TIMEZONE || 'Asia/Kolkata'}"`,
    '',
    '# Guards the scheduled reminder run. Empty leaves the cron path closed.',
    `CRON_SECRET="${values.CRON_SECRET || ''}"`,
    '',
  ].join('\n');
  writeFileSync(ENV_PATH, body);
}

/** A local database is the common case — guess its URL before asking. */
function localGuess() {
  const user = platform === 'darwin' ? process.env.USER || 'postgres' : 'postgres';
  return `postgresql://${user}@localhost:5432/syncup`;
}

function cannotReach() {
  warn('The database did not answer.');
  say('');
  say('  If it is meant to be local, start it and create the database:');
  say(
    platform === 'darwin'
      ? '    brew services start postgresql@16 && createdb syncup'
      : '    sudo service postgresql start && createdb syncup',
  );
  say('');
  say(`  If it is hosted, check DATABASE_URL in ${ENV_PATH}.`);
  say('  Then run: npm run setup');
}

const nodeMajor = Number(process.versions.node.split('.')[0]);

async function main() {
  say('\n[1mSyncup setup[0m');

  step('1. Node');
  if (nodeMajor < 18) {
    warn(`Node ${process.versions.node} is too old. Install Node 20 or newer, then run this again.`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);

  step('2. Configuration');
  const env = readEnv();
  let changed = false;

  if (!env.SESSION_SECRET || PLACEHOLDER.test(env.SESSION_SECRET)) {
    env.SESSION_SECRET = randomBytes(48).toString('base64');
    changed = true;
    ok('Generated a session secret');
  } else {
    ok('Session secret already set');
  }

  if (!env.DATABASE_URL || PLACEHOLDER.test(env.DATABASE_URL)) {
    const rl = createInterface({ input: stdin, output: stdout });
    say('');
    say('  Paste a Postgres connection string.');
    say('  · Neon/Supabase give you one — nothing to install.');
    say(`  · Running Postgres locally? Press Enter for ${localGuess()}`);
    say('');
    const answer = (await rl.question('  DATABASE_URL: ')).trim();
    rl.close();
    env.DATABASE_URL = answer || localGuess();
    changed = true;
  } else {
    ok('Database URL already set');
  }

  if (changed) {
    writeEnv(env);
    ok(`Wrote ${ENV_PATH}`);
  }

  // db push reaches the server, creates the database if it is missing, and builds
  // the tables — so it is both the connection check and the migration in one go.
  step('3. Tables');
  try {
    run('npx prisma db push');
  } catch {
    cannotReach();
    process.exit(1);
  }

  step('4. Demo data');
  run('node prisma/seed.js');

  step('Ready.');
  say('  Start it with:  npm run dev');
  say('  Then open:      http://localhost:3000');
  say('');
}

main().catch((err) => {
  console.error(`\nSetup stopped: ${err.message}`);
  process.exit(1);
});
