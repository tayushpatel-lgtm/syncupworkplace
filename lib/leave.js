import { prisma } from './db';
import { getSettings, holidayKeySet } from './settings';
import { rangeKeys, isWorkingDay, dayKey, shiftDay } from './dates';

/** Leave is counted in working days — weekends and holidays inside a range are free. */
export async function workingDaysBetween(startKey, endKey) {
  const settings = await getSettings();
  const holidays = await holidayKeySet(startKey, endKey);
  const holidayKeys = new Set(holidays.keys());
  return rangeKeys(startKey, endKey).filter((k) => isWorkingDay(k, settings.workingDays, holidayKeys))
    .length;
}

export function currentYear() {
  return Number(dayKey().slice(0, 4));
}

/**
 * What each employment type earns a month. Casual leave accumulates up to the
 * cap and stays there; sick leave is replaced outright every month, so an
 * unused day never carries — freelancers get neither, only the weekly off.
 */
export const LEAVE_POLICY = {
  FULL_TIME: { casualPerMonth: 1, sickPerMonth: 1, casualCap: 6 },
  INTERN: { casualPerMonth: 1, sickPerMonth: 0, casualCap: 6 },
  FREELANCER: { casualPerMonth: 0, sickPerMonth: 0, casualCap: 0 },
};

/** "YYYY-MM" from a "YYYY-MM-DD" day key. */
export function monthKey(key) {
  return key.slice(0, 7);
}

function nextMonthKey(mKey) {
  // +32 days from the 1st always lands in the next month, whatever this one's length.
  return shiftDay(`${mKey}-01`, 32).slice(0, 7);
}

/**
 * The first month someone's monthly accrual counts from: their join month if
 * they joined on or before the 15th, otherwise the month after — joining late
 * in a month earns nothing for the days already gone.
 */
export function firstAccrualMonth(joinedAtKey) {
  const day = Number(joinedAtKey.slice(8, 10));
  const m = monthKey(joinedAtKey);
  return day <= 15 ? m : nextMonthKey(m);
}

/**
 * One month's worth of accrual for a person, computed fresh from their
 * current balances. Returns null when nothing should change — either this
 * month was already processed, or their accrual hasn't started yet.
 */
export function nextAccrual(person, todayKey = dayKey()) {
  const policy = LEAVE_POLICY[person.employmentType] || LEAVE_POLICY.FULL_TIME;
  const today = monthKey(todayKey);
  const startMonth = firstAccrualMonth(person.joinedAtKey);

  if (today < startMonth) return null;
  if (person.lastLeaveAccrualMonth === today) return null;

  return {
    casualLeaveBalance: Math.min(policy.casualCap, person.casualLeaveBalance + policy.casualPerMonth),
    sickLeaveBalance: policy.sickPerMonth,
    lastLeaveAccrualMonth: today,
  };
}

/** Applies nextAccrual for one person if it's due, writing the result. */
export async function accrueIfDue(user, todayKey = dayKey()) {
  const next = nextAccrual(
    {
      employmentType: user.employmentType,
      joinedAtKey: dayKey(user.joinedAt),
      casualLeaveBalance: user.casualLeaveBalance,
      sickLeaveBalance: user.sickLeaveBalance,
      lastLeaveAccrualMonth: user.lastLeaveAccrualMonth,
    },
    todayKey,
  );
  if (!next) return user;
  return prisma.user.update({ where: { id: user.id }, data: next });
}

/** Casual leave needs 2 days' notice; sick leave can be filed for any date. */
export function canRequestCasual(startKey, todayKey = dayKey()) {
  return startKey >= shiftDay(todayKey, 2);
}
