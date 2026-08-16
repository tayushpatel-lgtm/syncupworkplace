import { describe, it, expect, beforeAll } from 'vitest';
import { api, page, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('the working day', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('flags a late check-in against a deadline that has already passed', async () => {
    const person = await createPerson(ceoCookie, { checkInBy: '00:01' });
    const res = await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);
    expect(res.json.late).toBe(true);
  });

  it('does not flag a check-in ahead of a deadline that has not arrived yet', async () => {
    const person = await createPerson(ceoCookie, { checkInBy: '23:59' });
    const res = await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);
    expect(res.json.late).toBe(false);
  });

  it('a second check-in the same day is a no-op, not a second late judgement', async () => {
    const person = await createPerson(ceoCookie, { checkInBy: '00:01' });
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    const again = await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    expect(again.status).toBe(200);
  });

  it('blocks the rest of the day until the plan has at least one point', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const before = await page('/', { cookie: person.cookie });
    expect(before.status).toBe(200);
    expect(before.text).toContain('at least one point');
    expect(before.text).not.toContain('RECORDED WORK');

    const add = await api('/api/day/plan', {
      method: 'POST',
      cookie: person.cookie,
      body: { action: 'add', title: 'First thing' },
    });
    expect(add.status).toBe(200);

    const after = await page('/', { cookie: person.cookie });
    expect(after.text).not.toContain('at least one point');
    expect(after.text).toContain('RECORDED WORK');
  });

  it('rejects an unknown session kind', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    const res = await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'NAP' } });
    expect(res.status).toBe(400);
  });

  it('the heartbeat requires a session', async () => {
    const anon = await api('/api/day/heartbeat', { method: 'POST' });
    expect(anon.status).toBe(401);

    const person = await createPerson(ceoCookie);
    const signedIn = await api('/api/day/heartbeat', { method: 'POST', cookie: person.cookie });
    expect(signedIn.status).toBe(200);
  });

  it('requires the report to close the day, by default', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Something' } });

    const empty = await api('/api/day/report', { method: 'POST', cookie: person.cookie, body: { summary: '   ' } });
    expect(empty.status).toBe(400);

    const filed = await api('/api/day/report', {
      method: 'POST',
      cookie: person.cookie,
      body: { summary: 'Did the thing.', closeDay: true },
    });
    expect(filed.status).toBe(200);

    const attendance = await testDb.attendance.findFirst({ where: { userId: person.id } });
    expect(attendance.checkOutAt).not.toBeNull();
  });

  it('starting work again reopens a day that was closed', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Something' } });
    await api('/api/day/report', { method: 'POST', cookie: person.cookie, body: { summary: 'Done.', closeDay: true } });

    let attendance = await testDb.attendance.findFirst({ where: { userId: person.id } });
    expect(attendance.checkOutAt).not.toBeNull();

    await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'WORK' } });
    attendance = await testDb.attendance.findFirst({ where: { userId: person.id } });
    expect(attendance.checkOutAt).toBeNull();
  });
});
