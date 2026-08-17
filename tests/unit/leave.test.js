import { describe, it, expect } from 'vitest';
import { LEAVE_POLICY, monthKey, firstAccrualMonth, nextAccrual, canRequestCasual } from '../../lib/leave.js';

describe('monthKey', () => {
  it('takes the year-month off a day key', () => {
    expect(monthKey('2026-08-17')).toBe('2026-08');
  });
});

describe('firstAccrualMonth', () => {
  it('starts in the join month when joining on or before the 15th', () => {
    expect(firstAccrualMonth('2026-09-01')).toBe('2026-09');
    expect(firstAccrualMonth('2026-09-15')).toBe('2026-09');
  });

  it('starts the month after when joining past the 15th', () => {
    expect(firstAccrualMonth('2026-09-16')).toBe('2026-10');
    expect(firstAccrualMonth('2026-09-30')).toBe('2026-10');
  });

  it('rolls a year boundary correctly', () => {
    expect(firstAccrualMonth('2026-12-20')).toBe('2027-01');
  });
});

describe('nextAccrual', () => {
  const fullTimer = (over = {}) => ({
    employmentType: 'FULL_TIME',
    joinedAtKey: '2026-01-01',
    casualLeaveBalance: 0,
    sickLeaveBalance: 0,
    lastLeaveAccrualMonth: null,
    ...over,
  });

  it('credits 1 casual and 1 sick day for a full-timer\'s first month', () => {
    const next = nextAccrual(fullTimer(), '2026-01-10');
    expect(next).toEqual({ casualLeaveBalance: 1, sickLeaveBalance: 1, lastLeaveAccrualMonth: '2026-01' });
  });

  it('is a no-op the second time it runs in the same month', () => {
    const already = fullTimer({ casualLeaveBalance: 1, sickLeaveBalance: 1, lastLeaveAccrualMonth: '2026-01' });
    expect(nextAccrual(already, '2026-01-28')).toBeNull();
  });

  it('caps casual leave at 6 and never reduces it once there', () => {
    const atCap = fullTimer({ casualLeaveBalance: 6, sickLeaveBalance: 0, lastLeaveAccrualMonth: '2026-06' });
    const next = nextAccrual(atCap, '2026-07-01');
    expect(next.casualLeaveBalance).toBe(6);
  });

  it('accumulates casual leave month over month up to the cap', () => {
    let person = fullTimer();
    for (let i = 0; i < 8; i += 1) {
      const monthNum = String(i + 1).padStart(2, '0');
      const result = nextAccrual(person, `2026-${monthNum}-05`);
      person = { ...person, ...result };
    }
    // 8 months of accrual, capped at 6.
    expect(person.casualLeaveBalance).toBe(6);
  });

  it('replaces sick leave outright rather than adding to it — unused doesn\'t carry', () => {
    const carriedOver = fullTimer({ casualLeaveBalance: 2, sickLeaveBalance: 1, lastLeaveAccrualMonth: '2026-01' });
    const next = nextAccrual(carriedOver, '2026-02-01');
    expect(next.sickLeaveBalance).toBe(1); // not 2 — the unused day from January is gone
  });

  it('gives interns casual leave but no sick leave', () => {
    const intern = fullTimer({ employmentType: 'INTERN' });
    const next = nextAccrual(intern, '2026-01-05');
    expect(next).toEqual({ casualLeaveBalance: 1, sickLeaveBalance: 0, lastLeaveAccrualMonth: '2026-01' });
  });

  it('gives freelancers nothing at all', () => {
    const freelancer = fullTimer({ employmentType: 'FREELANCER' });
    const next = nextAccrual(freelancer, '2026-01-05');
    expect(next).toEqual({ casualLeaveBalance: 0, sickLeaveBalance: 0, lastLeaveAccrualMonth: '2026-01' });
  });

  it('does not accrue before the first accrual month has arrived', () => {
    // Joined the 20th, so accrual starts in February, not January.
    const lateJoiner = fullTimer({ joinedAtKey: '2026-01-20' });
    expect(nextAccrual(lateJoiner, '2026-01-25')).toBeNull();
    expect(nextAccrual(lateJoiner, '2026-02-01')).not.toBeNull();
  });
});

describe('canRequestCasual', () => {
  it('requires at least 2 days\' notice', () => {
    expect(canRequestCasual('2026-08-19', '2026-08-17')).toBe(true);
    expect(canRequestCasual('2026-08-18', '2026-08-17')).toBe(false);
    expect(canRequestCasual('2026-08-17', '2026-08-17')).toBe(false);
  });
});

describe('LEAVE_POLICY', () => {
  it('gives full-timers both leave kinds, interns casual only, freelancers neither', () => {
    expect(LEAVE_POLICY.FULL_TIME).toEqual({ casualPerMonth: 1, sickPerMonth: 1, casualCap: 6 });
    expect(LEAVE_POLICY.INTERN.sickPerMonth).toBe(0);
    expect(LEAVE_POLICY.FREELANCER.casualPerMonth).toBe(0);
    expect(LEAVE_POLICY.FREELANCER.sickPerMonth).toBe(0);
  });
});
