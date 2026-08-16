import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';
import { dayKey, shiftDay, rangeKeys, isWorkingDay } from '../../lib/dates.js';

async function workingDaysFromToday(offsetStart, offsetEnd) {
  const settings = await testDb.settings.findUnique({ where: { id: 1 } });
  const holidays = await testDb.holiday.findMany({ select: { date: true } });
  const holidayKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const startDate = shiftDay(dayKey(), offsetStart);
  const endDate = shiftDay(dayKey(), offsetEnd);
  const count = rangeKeys(startDate, endDate).filter((k) => isWorkingDay(k, settings.workingDays, holidayKeys)).length;
  return { startDate, endDate, count };
}

describe('leave', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('counts only working days in the range, not the calendar span', async () => {
    const person = await createPerson(ceoCookie);
    const range = await workingDaysFromToday(10, 20); // an 11-day span with at least one weekend in it

    const res = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate: range.startDate, endDate: range.endDate, reason: 'Trip' },
    });
    expect(res.status).toBe(200);
    expect(res.json.days).toBe(range.count);
    expect(res.json.days).toBeLessThan(11); // proves weekends were excluded
  });

  it('rejects a request that overlaps one already filed', async () => {
    const person = await createPerson(ceoCookie);
    const first = await workingDaysFromToday(30, 33);
    await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate: first.startDate, endDate: first.endDate },
    });

    const overlap = await workingDaysFromToday(31, 35);
    const res = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate: overlap.startDate, endDate: overlap.endDate },
    });
    expect(res.status).toBe(409);
  });

  it('refuses a request longer than the remaining balance', async () => {
    const person = await createPerson(ceoCookie);
    // The default balance is 12 planned days; ask for a span that needs more
    // working days than that, far enough out to dodge the overlap check above.
    const range = await workingDaysFromToday(200, 260);
    const res = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate: range.startDate, endDate: range.endDate },
    });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/left/);
  });

  it('approving spends the balance; rejecting does not', async () => {
    const approved = await createPerson(ceoCookie);
    const rejected = await createPerson(ceoCookie);
    const range = await workingDaysFromToday(60, 62);
    const body = { kind: 'PLANNED', startDate: range.startDate, endDate: range.endDate };

    const req1 = await api('/api/leave', { method: 'POST', cookie: approved.cookie, body });
    const req2 = await api('/api/leave', { method: 'POST', cookie: rejected.cookie, body });

    const leave1 = await testDb.leaveRequest.findFirst({ where: { userId: approved.id } });
    const leave2 = await testDb.leaveRequest.findFirst({ where: { userId: rejected.id } });

    await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave1.id, decision: 'APPROVED' } });
    await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave2.id, decision: 'REJECTED' } });

    const year = Number(range.startDate.slice(0, 4));
    const balance1 = await testDb.leaveBalance.findUnique({ where: { userId_year: { userId: approved.id, year } } });
    const balance2 = await testDb.leaveBalance.findUnique({ where: { userId_year: { userId: rejected.id, year } } });

    expect(balance1.plannedUsed).toBe(req1.json.days);
    expect(balance2.plannedUsed).toBe(0);
  });

  it('a request already decided cannot be decided again', async () => {
    const person = await createPerson(ceoCookie);
    const range = await workingDaysFromToday(70, 71);
    await api('/api/leave', { method: 'POST', cookie: person.cookie, body: { kind: 'SICK', ...range } });
    const leave = await testDb.leaveRequest.findFirst({ where: { userId: person.id } });

    const first = await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave.id, decision: 'APPROVED' } });
    expect(first.status).toBe(200);

    const second = await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave.id, decision: 'REJECTED' } });
    expect(second.status).toBe(409);
  });

  it('only an admin can decide a leave request', async () => {
    const person = await createPerson(ceoCookie);
    const range = await workingDaysFromToday(80, 81);
    await api('/api/leave', { method: 'POST', cookie: person.cookie, body: { kind: 'SICK', ...range } });
    const leave = await testDb.leaveRequest.findFirst({ where: { userId: person.id } });

    const res = await api('/api/leave/decide', { method: 'POST', cookie: person.cookie, body: { id: leave.id, decision: 'APPROVED' } });
    expect(res.status).toBe(403);
  });
});
