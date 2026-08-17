import { PrismaClient } from '@prisma/client';
import { BASE_URL, FIXTURE, TEST_DB_URL, TEST_PASSWORD } from './config.js';

/** Direct DB access for fixture setup only — assertions should go through the API. */
export const testDb = new PrismaClient({ datasourceUrl: TEST_DB_URL });

function parseSetCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

export async function login(email, password = TEST_PASSWORD) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = parseSetCookie(res);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, cookie, body };
}

export async function loginAsCeo() {
  const { cookie, status } = await login(FIXTURE.ceo.email);
  if (status !== 200 || !cookie) throw new Error('CEO fixture login failed — is global setup seeding it?');
  return cookie;
}

/** A thin fetch wrapper: JSON in, JSON out, cookies explicit, redirects not followed. */
export async function api(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let json = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}

/** A page fetch — same idea, but returns text/html for grepping instead of JSON. */
export async function page(path, { cookie } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get('location') };
}

let counter = 0;
export function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@fixture.test`;
}

/**
 * A fresh, fully onboarded person via the real API — isolated from whatever
 * other tests have done to the shared fixture users. Returns their id, email
 * and a ready-to-use session cookie.
 */
export async function createPerson(ceoCookie, opts = {}) {
  const { role = 'EMPLOYEE', employmentType, department, name, checkInBy, minPresentMinutes } = opts;
  const email = uniqueEmail(role.toLowerCase());
  const created = await api('/api/people', {
    method: 'POST',
    cookie: ceoCookie,
    body: {
      name: name || `Fixture ${email.split('.')[0]}`,
      email,
      role,
      employmentType,
      department,
      checkInBy,
      minPresentMinutes,
    },
  });
  if (created.status !== 200) {
    throw new Error(`createPerson(${email}) failed: ${JSON.stringify(created.json)}`);
  }

  // Everyone starts with their email as their password and is forced to
  // change it — set it to the fixture's known password up front, the same
  // way a real first login would, so the rest of the suite doesn't have to
  // deal with the change-password gate for every fixture person it creates.
  const { cookie: startCookie, status: startStatus } = await login(email, email);
  if (startStatus !== 200) throw new Error(`login as fresh fixture ${email} failed`);
  const changed = await api('/api/account/password', {
    method: 'POST',
    cookie: startCookie,
    body: { password: TEST_PASSWORD },
  });
  if (changed.status !== 200) throw new Error(`could not set fixture ${email}'s password`);

  const { cookie, status } = await login(email);
  if (status !== 200) throw new Error(`login as fresh fixture ${email} failed`);

  const steps = await testDb.onboardingStep.findMany({ select: { id: true } });
  for (const step of steps) {
    await api('/api/onboarding', { method: 'POST', cookie, body: { stepId: step.id, done: true } });
  }

  return { id: created.json.id, email, cookie };
}
