import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';
import { dayKey, shiftDay, rangeKeys, isWorkingDay, previousWorkingDay, zonedTimeToUtc } from '../../lib/dates.js';

async function workingDaysFromToday(offsetStart, offsetEnd) {
  const settings = await testDb.settings.findUnique({ where: { id: 1 } });
  const holidays = await testDb.holiday.findMany({ select: { date: true } });
  const holidayKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const startDate = shiftDay(dayKey(), offsetStart);
  const endDate = shiftDay(dayKey(), offsetEnd);
  const count = rangeKeys(startDate, endDate).filter((k) => isWorkingDay(k, settings.workingDays, holidayKeys)).length;
  return { startDate, endDate, count };
}

/** Fixture people start at 0/0 until they're accrued — set a balance directly for tests that need one. */
async function grantBalance(userId, { casual = 0, sick = 0 } = {}) {
  await testDb.user.update({ where: { id: userId }, data: { casualLeaveBalance: casual, sickLeaveBalance: sick } });
}

describe('leave requests', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('counts only working days in the range, not the calendar span', async () => {
    const person = await createPerson(ceoCookie);
    await grantBalance(person.id, { casual: 20 });
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

  it('rejects casual leave requested with less than 2 days\' notice', async () => {
    const person = await createPerson(ceoCookie);
    await grantBalance(person.id, { casual: 20 });
    const tomorrow = shiftDay(dayKey(), 1);

    const res = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate: tomorrow, endDate: tomorrow },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/notice/);
  });

  it('allows sick leave on any date, including one already past', async () => {
    const person = await createPerson(ceoCookie);
    await grantBalance(person.id, { sick: 5 });
    // A real working day in the past, whatever weekday the suite happens to run on.
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    const past = previousWorkingDay(dayKey(), settings.workingDays);

    const res = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'SICK', startDate: past, endDate: past },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a request that overlaps one already filed', async () => {
    const person = await createPerson(ceoCookie);
    await grantBalance(person.id, { casual: 20 });
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
    await grantBalance(person.id, { casual: 2 });
    // Far enough out to dodge the overlap check above, and comfortably longer than the balance.
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
    await grantBalance(approved.id, { casual: 10 });
    await grantBalance(rejected.id, { casual: 10 });
    const range = await workingDaysFromToday(60, 62);
    const body = { kind: 'PLANNED', startDate: range.startDate, endDate: range.endDate };

    const req1 = await api('/api/leave', { method: 'POST', cookie: approved.cookie, body });
    await api('/api/leave', { method: 'POST', cookie: rejected.cookie, body });

    const leave1 = await testDb.leaveRequest.findFirst({ where: { userId: approved.id } });
    const leave2 = await testDb.leaveRequest.findFirst({ where: { userId: rejected.id } });

    await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave1.id, decision: 'APPROVED' } });
    await api('/api/leave/decide', { method: 'POST', cookie: ceoCookie, body: { id: leave2.id, decision: 'REJECTED' } });

    const row1 = await testDb.user.findUnique({ where: { id: approved.id } });
    const row2 = await testDb.user.findUnique({ where: { id: rejected.id } });

    expect(row1.casualLeaveBalance).toBe(10 - req1.json.days);
    expect(row2.casualLeaveBalance).toBe(10);
  });

  it('a request already decided cannot be decided again', async () => {
    const person = await createPerson(ceoCookie);
    await grantBalance(person.id, { sick: 5 });
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
    await grantBalance(person.id, { sick: 5 });
    const range = await workingDaysFromToday(80, 81);
    await api('/api/leave', { method: 'POST', cookie: person.cookie, body: { kind: 'SICK', ...range } });
    const leave = await testDb.leaveRequest.findFirst({ where: { userId: person.id } });

    const res = await api('/api/leave/decide', { method: 'POST', cookie: person.cookie, body: { id: leave.id, decision: 'APPROVED' } });
    expect(res.status).toBe(403);
  });

  it('blocks a freelancer from filing leave at all', async () => {
    const person = await createPerson(ceoCookie, { employmentType: 'FREELANCER' });
    const range = await workingDaysFromToday(90, 91);
    const res = await api('/api/leave', { method: 'POST', cookie: person.cookie, body: { kind: 'SICK', ...range } });
    expect(res.status).toBe(403);
  });
});

describe('monthly leave accrual', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('credits someone who joined this month on or before the 15th', async () => {
    const person = await createPerson(ceoCookie);
    const thisMonth = dayKey().slice(0, 7);
    await testDb.user.update({
      where: { id: person.id },
      data: {
        joinedAt: zonedTimeToUtc(`${thisMonth}-05`, '12:00'),
        casualLeaveBalance: 0,
        sickLeaveBalance: 0,
        lastLeaveAccrualMonth: null,
      },
    });

    const res = await api('/api/cron/leave-accrual', { method: 'POST', cookie: ceoCookie });
    expect(res.status).toBe(200);

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.casualLeaveBalance).toBe(1);
    expect(row.sickLeaveBalance).toBe(1);
    expect(row.lastLeaveAccrualMonth).toBe(thisMonth);
  });

  it('does not credit someone who joined this month after the 15th', async () => {
    const person = await createPerson(ceoCookie);
    const thisMonth = dayKey().slice(0, 7);
    await testDb.user.update({
      where: { id: person.id },
      data: {
        joinedAt: zonedTimeToUtc(`${thisMonth}-20`, '12:00'),
        casualLeaveBalance: 0,
        sickLeaveBalance: 0,
        lastLeaveAccrualMonth: null,
      },
    });

    await api('/api/cron/leave-accrual', { method: 'POST', cookie: ceoCookie });

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.casualLeaveBalance).toBe(0);
    expect(row.sickLeaveBalance).toBe(0);
    expect(row.lastLeaveAccrualMonth).toBeNull();
  });

  it('is idempotent within the same month', async () => {
    const person = await createPerson(ceoCookie);
    const thisMonth = dayKey().slice(0, 7);
    await testDb.user.update({
      where: { id: person.id },
      data: {
        joinedAt: zonedTimeToUtc(`${thisMonth}-05`, '12:00'),
        casualLeaveBalance: 0,
        sickLeaveBalance: 0,
        lastLeaveAccrualMonth: null,
      },
    });

    await api('/api/cron/leave-accrual', { method: 'POST', cookie: ceoCookie });
    await api('/api/cron/leave-accrual', { method: 'POST', cookie: ceoCookie });

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.casualLeaveBalance).toBe(1); // not 2 — the second pass was a no-op
  });

  it('is closed to a non-admin', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/cron/leave-accrual', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(403);
  });
});
