import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('check-in requires a confirmed plan', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('check-in returns the auto-seeded plan, empty for someone with nothing assigned', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);
    expect(res.json.plan).toEqual([]);
  });

  it('check-in seeds the plan from an already-assigned open task', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/tasks', { method: 'POST', cookie: ceoCookie, body: { title: 'Ship the report', assigneeId: person.id } });

    const res = await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    expect(res.json.plan.map((p) => p.title)).toContain('Ship the report');
  });

  it('refuses to confirm check-in with an empty plan', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const confirm = await api('/api/day/check-in/confirm', { method: 'POST', cookie: person.cookie });
    expect(confirm.status).toBe(400);
  });

  it('refuses to confirm before ever checking in', async () => {
    const person = await createPerson(ceoCookie);
    const confirm = await api('/api/day/check-in/confirm', { method: 'POST', cookie: person.cookie });
    expect(confirm.status).toBe(400);
  });

  it('confirms once at least one point exists, and the day actually starts', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'First thing' } });

    const confirm = await api('/api/day/check-in/confirm', { method: 'POST', cookie: person.cookie });
    expect(confirm.status).toBe(200);

    const attendance = await testDb.attendance.findFirst({ where: { userId: person.id } });
    expect(attendance.checkInAt).not.toBeNull();
  });
});

describe('check-out ticks and closes the day in one request', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('marks exactly the given points done, closes the day, and files the summary', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    const a = await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Ship the report' } });
    const b = await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Review PRs' } });
    await api('/api/day/check-in/confirm', { method: 'POST', cookie: person.cookie });

    const res = await api('/api/day/report', {
      method: 'POST',
      cookie: person.cookie,
      body: { summary: 'Also fixed the deploy.', closeDay: true, doneIds: [a.json.id] },
    });
    expect(res.status).toBe(200);

    const points = await testDb.planPoint.findMany({ where: { userId: person.id }, orderBy: { order: 'asc' } });
    expect(points.find((p) => p.id === a.json.id).done).toBe(true);
    expect(points.find((p) => p.id === b.json.id).done).toBe(false);

    const attendance = await testDb.attendance.findFirst({ where: { userId: person.id } });
    expect(attendance.checkOutAt).not.toBeNull();

    const report = await testDb.dailyReport.findFirst({ where: { userId: person.id } });
    expect(report.summary).toBe('Also fixed the deploy.');
  });

  it('can un-tick a point that was previously done, not just add new ones', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    const a = await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Ship the report' } });
    await api('/api/day/check-in/confirm', { method: 'POST', cookie: person.cookie });
    await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'toggle', id: a.json.id, done: true } });

    await api('/api/day/report', {
      method: 'POST',
      cookie: person.cookie,
      body: { summary: 'Actually did not finish it.', closeDay: true, doneIds: [] },
    });

    const point = await testDb.planPoint.findUnique({ where: { id: a.json.id } });
    expect(point.done).toBe(false);
  });
});

describe('personal Slack ID', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('rejects a value that does not look like a Slack member ID', async () => {
    const res = await api('/api/account/slack-id', { method: 'POST', cookie: ceoCookie, body: { value: 'not-an-id' } });
    expect(res.status).toBe(400);
  });

  it('accepts and normalises a real-shaped ID, and lets a blank value clear it', async () => {
    const person = await createPerson(ceoCookie);
    const set = await api('/api/account/slack-id', { method: 'POST', cookie: person.cookie, body: { value: 'u0123abcde' } });
    expect(set.status).toBe(200);
    expect(set.json.slackUserId).toBe('U0123ABCDE');

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.slackUserId).toBe('U0123ABCDE');

    const cleared = await api('/api/account/slack-id', { method: 'POST', cookie: person.cookie, body: { value: '' } });
    expect(cleared.status).toBe(200);
    expect(cleared.json.slackUserId).toBeNull();
  });

  it('only ever sets the signed-in person\'s own row', async () => {
    const a = await createPerson(ceoCookie);
    const b = await createPerson(ceoCookie);
    await api('/api/account/slack-id', { method: 'POST', cookie: a.cookie, body: { value: 'U0123AAAAA' } });

    const rowB = await testDb.user.findUnique({ where: { id: b.id } });
    expect(rowB.slackUserId).toBeNull();
  });
});
