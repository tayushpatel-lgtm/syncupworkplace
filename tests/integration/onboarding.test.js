import { describe, it, expect, beforeAll } from 'vitest';
import { api, page, login, loginAsCeo, testDb, uniqueEmail } from './helpers.js';
import { TEST_PASSWORD } from './config.js';

describe('onboarding gate', () => {
  let ceoCookie;
  let personCookie;
  let personId;
  let stepIds;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();

    const email = uniqueEmail('gate');
    const created = await api('/api/people', {
      method: 'POST',
      cookie: ceoCookie,
      body: { name: 'Gate Test', email, password: TEST_PASSWORD, role: 'EMPLOYEE' },
    });
    personId = created.json.id;

    const login1 = await login(email);
    personCookie = login1.cookie;

    stepIds = (await testDb.onboardingStep.findMany({ select: { id: true } })).map((s) => s.id);
  });

  it('blocks the app entirely until every step is ticked', async () => {
    const home = await page('/', { cookie: personCookie });
    expect(home.status).toBe(307);
    expect(home.location).toContain('/onboarding');

    const admin = await page('/admin', { cookie: personCookie });
    expect(admin.status).toBe(307); // not even reachable to check the 403, the gate wins first
  });

  it('lets the app through once every step is ticked', async () => {
    for (const stepId of stepIds) {
      const res = await api('/api/onboarding', { method: 'POST', cookie: personCookie, body: { stepId, done: true } });
      expect(res.status).toBe(200);
    }
    const home = await page('/', { cookie: personCookie });
    expect(home.status).toBe(200);
  });

  it('re-blocks if a step is unticked again', async () => {
    await api('/api/onboarding', { method: 'POST', cookie: personCookie, body: { stepId: stepIds[0], done: false } });
    const home = await page('/', { cookie: personCookie });
    expect(home.status).toBe(307);
    expect(home.location).toContain('/onboarding');
    // put it back so later tests in this file aren't affected
    await api('/api/onboarding', { method: 'POST', cookie: personCookie, body: { stepId: stepIds[0], done: true } });
  });

  it('is advisory, not blocking, when the setting is turned off', async () => {
    await api('/api/onboarding', { method: 'POST', cookie: personCookie, body: { stepId: stepIds[0], done: false } });

    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { onboardingEnforced: false } });
    const home = await page('/', { cookie: personCookie });
    expect(home.status).toBe(200);

    // restore, so it doesn't leak into other test files
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { onboardingEnforced: true } });
    await api('/api/onboarding', { method: 'POST', cookie: personCookie, body: { stepId: stepIds[0], done: true } });
  });
});
