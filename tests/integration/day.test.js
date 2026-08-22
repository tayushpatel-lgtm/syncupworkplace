import { describe, it, expect, beforeAll } from 'vitest';
import { api, page, loginAsCeo, createPerson, testDb } from './helpers.js';
import { BASE_URL } from './config.js';
import {
  dayKey,
  dayDate,
  shiftDay,
  startOfDay,
  endOfDay,
  zonedTimeToUtc,
  dateFieldKey,
} from '../../lib/dates.js';

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

  it('closes a session whose heartbeat has gone stale past the idle cut-off', async () => {
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    const originalCutoff = settings.idleAfterMinutes;
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 2 } });

    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    // Back-date the heartbeat well past the 2-minute cut-off — the same
    // situation as a machine that went to sleep mid-session.
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await testDb.workSession.updateMany({ where: { userId: person.id, endedAt: null }, data: { lastBeatAt: stale, startedAt: stale } });

    // Any endpoint that reconciles the day's sessions picks it up — switching
    // to a break is the simplest one that doesn't need a plan point first.
    const res = await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'BREAK' } });
    expect(res.status).toBe(200);

    const closed = await testDb.workSession.findFirst({ where: { userId: person.id, kind: 'WORK' } });
    expect(closed.endedAt).not.toBeNull();
    expect(closed.endedAt.getTime()).toBe(stale.getTime());

    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: originalCutoff } });
  });

  it('refuses a second open session for the same person', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const open = await testDb.workSession.findFirst({ where: { userId: person.id, endedAt: null } });
    expect(open).not.toBeNull();

    await expect(
      testDb.workSession.create({
        data: {
          userId: person.id,
          date: open.date,
          kind: 'BREAK',
          startedAt: new Date(),
          lastBeatAt: new Date(),
          openUserId: person.id,
        },
      }),
    ).rejects.toThrow();

    await expect(
      testDb.workSession.create({
        data: {
          userId: person.id,
          date: open.date,
          kind: 'BREAK',
          startedAt: new Date(),
          lastBeatAt: new Date(),
          endedAt: null,
        },
      }),
    ).rejects.toThrow();
  });

  it('a heartbeat after a stale gap reconciles instead of extending lastBeatAt', async () => {
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    const originalCutoff = settings.idleAfterMinutes;
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 2 } });

    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await testDb.workSession.updateMany({
      where: { userId: person.id, endedAt: null },
      data: { lastBeatAt: stale, startedAt: stale, idleCutoffMinutes: 2 },
    });

    const before = Date.now();
    const res = await api('/api/day/heartbeat', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);

    const work = await testDb.workSession.findFirst({ where: { userId: person.id, kind: 'WORK' } });
    expect(work.endedAt).not.toBeNull();
    expect(work.endedAt.getTime()).toBe(stale.getTime());
    expect(work.lastBeatAt.getTime()).toBe(stale.getTime());
    expect(work.lastBeatAt.getTime()).toBeLessThan(before);

    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: originalCutoff } });
  });

  it('splits a session whose last beat falls on a later company-local day', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const today = dayKey();
    const yesterday = shiftDay(today, -1);
    const startedAt = zonedTimeToUtc(yesterday, '18:00');
    const beat = zonedTimeToUtc(today, '09:00');

    await testDb.workSession.updateMany({
      where: { userId: person.id, endedAt: null },
      data: {
        date: dayDate(yesterday),
        startedAt,
        lastBeatAt: beat,
        idleCutoffMinutes: 2,
      },
    });

    const res = await api('/api/day/heartbeat', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);

    const work = await testDb.workSession.findMany({
      where: { userId: person.id, kind: 'WORK' },
      orderBy: { startedAt: 'asc' },
    });
    expect(work.length).toBeGreaterThanOrEqual(2);
    expect(dateFieldKey(work[0].date)).toBe(yesterday);
    expect(work[0].endedAt.getTime()).toBe(endOfDay(yesterday).getTime());
    expect(dateFieldKey(work[1].date)).toBe(today);
    expect(work[1].startedAt.getTime()).toBe(startOfDay(today).getTime());
    expect(work[1].endedAt.getTime()).toBe(beat.getTime());
  });

  it('excludes an open session from frozen report minutes instead of writing NaN', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/plan', { method: 'POST', cookie: person.cookie, body: { action: 'add', title: 'Something' } });

    const filed = await api('/api/day/report', {
      method: 'POST',
      cookie: person.cookie,
      body: { summary: 'Still going.', closeDay: false },
    });
    expect(filed.status).toBe(200);

    const report = await testDb.dailyReport.findFirst({ where: { userId: person.id } });
    expect(Number.isFinite(report.minutesWorked)).toBe(true);
    expect(report.minutesWorked).toBe(0);
    expect(report.minutesBreak).toBe(0);
    expect(report.minutesIdle).toBe(0);

    const stillOpen = await testDb.workSession.findFirst({ where: { userId: person.id, endedAt: null } });
    expect(stillOpen).not.toBeNull();
  });

  it('the idle-reconcile cron closes a stale open session without the person visiting', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await testDb.workSession.updateMany({
      where: { userId: person.id, endedAt: null },
      data: { lastBeatAt: stale, startedAt: stale, idleCutoffMinutes: 2 },
    });

    const res = await fetch(`${BASE_URL}/api/cron/reconcile-idle`, {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toBeGreaterThanOrEqual(1);

    const work = await testDb.workSession.findFirst({ where: { userId: person.id, kind: 'WORK' } });
    expect(work.endedAt).not.toBeNull();
    expect(work.endedAt.getTime()).toBe(stale.getTime());
  });

  it('judges silence against the cut-off frozen on the session, not the live setting', async () => {
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 2 } });

    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const pinned = await testDb.workSession.findFirst({ where: { userId: person.id, endedAt: null } });
    expect(pinned.idleCutoffMinutes).toBe(2);

    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 120 } });

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await testDb.workSession.updateMany({
      where: { userId: person.id, endedAt: null },
      data: { lastBeatAt: stale, startedAt: stale },
    });

    await api('/api/day/heartbeat', { method: 'POST', cookie: person.cookie });

    const work = await testDb.workSession.findFirst({ where: { userId: person.id, kind: 'WORK' } });
    expect(work.endedAt).not.toBeNull();
    expect(work.endedAt.getTime()).toBe(stale.getTime());

    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: settings.idleAfterMinutes === 120 ? 30 : settings.idleAfterMinutes } });
  });

  it('stores session.date as the company-local day, not the UTC date of the instant', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    const session = await testDb.workSession.findFirst({ where: { userId: person.id } });
    expect(dateFieldKey(session.date)).toBe(dayKey());
    expect(dateFieldKey(session.date)).toBe(dayKey(session.startedAt));
  });

  it('no-ops a second session switch of the same kind within a few seconds', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

    const first = await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'BREAK' } });
    expect(first.status).toBe(200);
    expect(first.json.skipped).toBeFalsy();

    const second = await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'BREAK' } });
    expect(second.status).toBe(200);
    expect(second.json.skipped).toBe(true);

    const breaks = await testDb.workSession.findMany({ where: { userId: person.id, kind: 'BREAK' } });
    expect(breaks).toHaveLength(1);
  });

  it('lets an admin edit and merge sessions, writing an audit log, and refuses a non-admin', async () => {
    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'BREAK' } });
    await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'WORK' } });

    const today = dayKey();
    const listed = await api(`/api/admin/sessions?userId=${person.id}&date=${today}`, { cookie: ceoCookie });
    expect(listed.status).toBe(200);
    expect(listed.json.sessions.length).toBeGreaterThanOrEqual(2);

    const morning = listed.json.sessions[0];
    const edited = await api(`/api/admin/sessions/${morning.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { startedTime: '09:00', endedTime: '10:00', kind: 'WORK', reason: 'Corrected a bad clock' },
    });
    expect(edited.status).toBe(200);
    expect(edited.json.session.startedTime).toBe('09:00');
    expect(edited.json.session.endedTime).toBe('10:00');

    const employee = await createPerson(ceoCookie);
    const forbidden = await api(`/api/admin/sessions/${morning.id}`, {
      method: 'PATCH',
      cookie: employee.cookie,
      body: { startedTime: '08:00', endedTime: '09:00', kind: 'WORK', reason: 'nope' },
    });
    expect(forbidden.status).toBe(403);

    const afterEdit = await api(`/api/admin/sessions?userId=${person.id}&date=${today}`, { cookie: ceoCookie });
    const closed = afterEdit.json.sessions.filter((s) => s.endedTime);
    expect(closed.length).toBeGreaterThanOrEqual(2);

    // Place two closed sessions adjacent so merge is legal.
    const a = closed[0];
    const b = closed[1];
    await api(`/api/admin/sessions/${a.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { startedTime: '09:00', endedTime: '10:00', kind: 'WORK', reason: 'Line up for merge' },
    });
    await api(`/api/admin/sessions/${b.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { startedTime: '10:00', endedTime: '11:00', kind: 'WORK', reason: 'Line up for merge' },
    });

    const merged = await api('/api/admin/sessions', {
      method: 'POST',
      cookie: ceoCookie,
      body: { keepId: a.id, absorbId: b.id, reason: 'Duplicate split from a glitch' },
    });
    expect(merged.status).toBe(200);
    expect(merged.json.session.startedTime).toBe('09:00');
    expect(merged.json.session.endedTime).toBe('11:00');

    const audits = await testDb.sessionAuditLog.findMany({ where: { userId: person.id }, orderBy: { createdAt: 'asc' } });
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(audits.some((row) => row.action === 'EDIT')).toBe(true);
    expect(audits.some((row) => row.action === 'MERGE')).toBe(true);
    expect(audits.every((row) => row.reason.length >= 3)).toBe(true);

    const missingReason = await api(`/api/admin/sessions/${a.id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { startedTime: '09:00', endedTime: '10:00', kind: 'WORK', reason: '' },
    });
    expect(missingReason.status).toBe(400);
  });

  it('closes a forgotten break that went stale past the alert threshold', async () => {
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: { idleAfterMinutes: 2, staleBreakAlertMinutes: 5 },
    });

    const person = await createPerson(ceoCookie);
    await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
    await api('/api/day/session', { method: 'POST', cookie: person.cookie, body: { kind: 'BREAK' } });

    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await testDb.workSession.updateMany({
      where: { userId: person.id, endedAt: null, kind: 'BREAK' },
      data: { lastBeatAt: stale, startedAt: stale, idleCutoffMinutes: 2 },
    });

    const res = await api('/api/day/heartbeat', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(200);

    const brk = await testDb.workSession.findFirst({ where: { userId: person.id, kind: 'BREAK' } });
    expect(brk.endedAt).not.toBeNull();
    expect(brk.endedAt.getTime()).toBe(stale.getTime());

    await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: { idleAfterMinutes: settings.idleAfterMinutes, staleBreakAlertMinutes: settings.staleBreakAlertMinutes },
    });
  });
});
