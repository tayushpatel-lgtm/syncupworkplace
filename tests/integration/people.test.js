import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAsCeo, createPerson, uniqueEmail, testDb } from './helpers.js';
import { FIXTURE } from './config.js';

describe('people management', () => {
  let ceoCookie;
  let ceoId;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    ceoId = (await testDb.user.findUnique({ where: { email: FIXTURE.ceo.email } })).id;
  });

  it('defaults a new person\'s password to their email and forces a change on first login', async () => {
    const email = uniqueEmail('fresh');
    const created = await api('/api/people', {
      method: 'POST',
      cookie: ceoCookie,
      body: { name: 'Fresh Hire', email, role: 'EMPLOYEE' },
    });
    expect(created.status).toBe(200);

    const row = await testDb.user.findUnique({ where: { id: created.json.id } });
    expect(row.mustChangePassword).toBe(true);

    const signIn = await login(email, email);
    expect(signIn.status).toBe(200);
  });

  it('rejects creating a second account with the same email', async () => {
    const email = uniqueEmail('dupe');
    const first = await api('/api/people', {
      method: 'POST',
      cookie: ceoCookie,
      body: { name: 'First', email, role: 'EMPLOYEE' },
    });
    expect(first.status).toBe(200);
    const second = await api('/api/people', {
      method: 'POST',
      cookie: ceoCookie,
      body: { name: 'Second', email, role: 'EMPLOYEE' },
    });
    expect(second.status).toBe(409);
  });

  it("only the CEO can reset another CEO's password", async () => {
    const admin = await createPerson(ceoCookie, { role: 'ADMIN' });
    const futureCeo = await createPerson(ceoCookie);
    await api(`/api/people/${futureCeo.id}`, { method: 'PATCH', cookie: ceoCookie, body: { role: 'CEO' } });

    const blocked = await api(`/api/people/${futureCeo.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { password: 'Hijacked1234' },
    });
    expect(blocked.status).toBe(403);

    const allowed = await api(`/api/people/${futureCeo.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { password: 'LegitimateReset1' },
    });
    expect(allowed.status).toBe(200);

    const signIn = await login(futureCeo.email, 'LegitimateReset1');
    expect(signIn.status).toBe(200);

    // A password they didn't pick themselves forces a change again, same as a first login.
    const row = await testDb.user.findUnique({ where: { id: futureCeo.id } });
    expect(row.mustChangePassword).toBe(true);
  });

  it('can set a person\'s employment type, which the leave form gates on', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api(`/api/people/${person.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { employmentType: 'FREELANCER' },
    });
    expect(res.status).toBe(200);

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.employmentType).toBe('FREELANCER');
  });

  it("an admin can reset a plain employee's password", async () => {
    const admin = await createPerson(ceoCookie, { role: 'ADMIN' });
    const employee = await createPerson(ceoCookie);
    const res = await api(`/api/people/${employee.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { password: 'ResetByAdmin1' },
    });
    expect(res.status).toBe(200);
  });

  it('only the CEO can promote someone to CEO', async () => {
    const admin = await createPerson(ceoCookie, { role: 'ADMIN' });
    const employee = await createPerson(ceoCookie);
    const res = await api(`/api/people/${employee.id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'CEO' } });
    expect(res.status).toBe(403);
  });

  it('cannot change your own role', async () => {
    const res = await api(`/api/people/${ceoId}`, { method: 'PATCH', cookie: ceoCookie, body: { role: 'ADMIN' } });
    expect(res.status).toBe(400);
  });

  it('cannot deactivate yourself', async () => {
    const res = await api(`/api/people/${ceoId}`, { method: 'PATCH', cookie: ceoCookie, body: { active: false } });
    expect(res.status).toBe(400);
  });

  it('a non-admin cannot add people at all', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/people', {
      method: 'POST',
      cookie: person.cookie,
      body: { name: 'Sneaky', email: uniqueEmail('sneaky'), role: 'EMPLOYEE' },
    });
    expect(res.status).toBe(403);
  });

  it('a deactivated person can no longer sign in', async () => {
    const person = await createPerson(ceoCookie);
    await api(`/api/people/${person.id}`, { method: 'PATCH', cookie: ceoCookie, body: { active: false } });
    const res = await login(person.email);
    expect(res.status).toBe(401);
  });
});
