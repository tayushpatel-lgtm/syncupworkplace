import { prisma } from './db';
import { getSettings, holidayKeySet } from './settings';
import { rangeKeys, isWorkingDay, dayKey } from './dates';

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

/** The balance row for a person and year, created on first look. */
export async function ensureBalance(userId, year = currentYear()) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { userId_year: { userId, year } },
  });
  if (existing) return existing;
  return prisma.leaveBalance.create({ data: { userId, year } });
}

export function remaining(balance) {
  return {
    sick: Math.max(0, balance.sickTotal - balance.sickUsed),
    planned: Math.max(0, balance.plannedTotal + balance.carried - balance.plannedUsed),
  };
}

/** Move the used counter when a request is approved, or back when it is undone. */
export async function applyToBalance(userId, kind, days, year, direction = 1) {
  const balance = await ensureBalance(userId, year);
  const field = kind === 'SICK' ? 'sickUsed' : 'plannedUsed';
  const next = Math.max(0, balance[field] + days * direction);
  return prisma.leaveBalance.update({
    where: { id: balance.id },
    data: { [field]: next },
  });
}
