import { describe, it, expect } from 'vitest';
import { FIXTURE } from './config.js';
import { login, loginAsCeo, api, page, createPerson } from './helpers.js';

describe('auth', () => {
  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await login(FIXTURE.ceo.email, 'not-the-password');
    const noSuchAccount = await login('nobody@fixture.test', 'whatever12345');
    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(wrongPassword.body.error).toBe(noSuchAccount.body.error);
  });

  it('signs in the seeded CEO fixture', async () => {
    const { status, cookie } = await login(FIXTURE.ceo.email);
    expect(status).toBe(200);
    expect(cookie).toBeTruthy();
  });

  it('rejects API access with no session', async () => {
    const res = await api('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('redirects an unauthenticated page request to /login', async () => {
    const res = await page('/');
    expect(res.status).toBe(307);
    expect(res.location).toContain('/login');
  });

  it('logout tells the browser to drop the cookie', async () => {
    // Sessions are stateless JWTs with no server-side revocation list, so logout
    // is a client-side instruction (Set-Cookie, Max-Age=0) — the old token
    // string itself stays structurally valid if someone kept resending it by
    // hand, which a real browser never would. What we can assert is the
    // instruction: the response tells the browser the cookie is expired now.
    const { cookie } = await login(FIXTURE.ceo.email);
    const { res } = await api('/api/auth/logout', { method: 'POST', cookie });
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/syncup_session=;/);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it('createPerson fixture produces a working, onboarded session', async () => {
    const ceoCookie = await loginAsCeo();
    const person = await createPerson(ceoCookie);
    const my = await page('/', { cookie: person.cookie });
    // 200, not a 307 to /onboarding — proves the fixture actually ticked every step.
    expect(my.status).toBe(200);
  });
});

describe('the forced password-change gate', () => {
  it('signs in with the email as the starting password, and sends a fresh account to /change-password ahead of onboarding', async () => {
    const ceoCookie = await loginAsCeo();
    const email = `fresh.gate.${Date.now()}@fixture.test`;
    await api('/api/people', { method: 'POST', cookie: ceoCookie, body: { name: 'Fresh Gate', email, role: 'EMPLOYEE' } });

    const { status, cookie } = await login(email, email);
    expect(status).toBe(200);

    const home = await page('/', { cookie });
    expect(home.status).toBe(307);
    expect(home.location).toContain('/change-password');
  });

  it('lets them through once they set their own password, then hands off to onboarding', async () => {
    const ceoCookie = await loginAsCeo();
    const email = `fresh.gate2.${Date.now()}@fixture.test`;
    await api('/api/people', { method: 'POST', cookie: ceoCookie, body: { name: 'Fresh Gate Two', email, role: 'EMPLOYEE' } });

    const first = await login(email, email);
    const changed = await api('/api/account/password', {
      method: 'POST',
      cookie: first.cookie,
      body: { password: 'BrandNewPass1' },
    });
    expect(changed.status).toBe(200);

    // The gate is cleared, but they're still a fresh account — onboarding takes over next.
    const second = await login(email, 'BrandNewPass1');
    const home = await page('/', { cookie: second.cookie });
    expect(home.status).toBe(307);
    expect(home.location).toContain('/onboarding');
  });

  it('rejects a new password under 8 characters', async () => {
    const ceoCookie = await loginAsCeo();
    const email = `fresh.gate3.${Date.now()}@fixture.test`;
    await api('/api/people', { method: 'POST', cookie: ceoCookie, body: { name: 'Fresh Gate Three', email, role: 'EMPLOYEE' } });

    const { cookie } = await login(email, email);
    const res = await api('/api/account/password', { method: 'POST', cookie, body: { password: 'short' } });
    expect(res.status).toBe(400);
  });
});
