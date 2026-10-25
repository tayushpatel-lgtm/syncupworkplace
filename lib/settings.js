import { prisma } from './db';

export const SETTINGS_ID = 1;

/** True when someone with `open` unfinished tasks may not take another. A cap of 0 means no cap. */
export function overCap(open, settings) {
  const cap = Number(settings?.assignmentCap) || 0;
  return cap > 0 && open >= cap;
}

/** "30" or "no cap" — for subtitles and chips. */
export function capLabel(settings) {
  const cap = Number(settings?.assignmentCap) || 0;
  return cap > 0 ? `the cap is ${cap} open tasks each` : 'no cap on open tasks';
}

const DEFAULTS = {
  id: SETTINGS_ID,
  assignmentCap: 20,
  reportRequired: true,
  planFromTasks: true,
  workingDays: [1, 2, 3, 4, 5, 6],
  defaultCheckInBy: '09:30',
  onboardingEnforced: true,
  slackEnabled: false,
  slackOnAssign: true,
  slackOnStatus: true,
  slackOnDeadline: true,
  slackBotEnabled: false,
  slackOnCheckin: false,
  slackOnCheckout: false,
  slackOnEodSummary: false,
  slackDmEnabled: false,
  slackDmOnAssign: true,
  slackDmOnAbsent: false,
  slackDmOnInactive: false,
  slackDmOnDailyPlan: false,
  slackDmOnCheckin: true,
  slackDmOnCheckout: true,
  slackDmOnStatus: true,
  slackDmOnDeadline: true,
  sheetsEnabled: false,
  idleAfterMinutes: 30,
  minPresentMinutes: 240,
};

/** The settings row, created on first read so a fresh deployment just works. */
export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.settings.create({ data: DEFAULTS });
}

/** The deadline that applies to one person on a given day. */
export function checkInDeadline(user, settings) {
  return user.checkInBy || settings.defaultCheckInBy;
}

/** The minimum worked minutes that count as present for one person. */
export function presentThresholdMinutes(user, settings) {
  return Number.isInteger(user.minPresentMinutes) ? user.minPresentMinutes : settings.minPresentMinutes;
}

export async function holidayKeySet(fromKey, toKey) {
  const rows = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(`${fromKey}T00:00:00.000Z`),
        lte: new Date(`${toKey}T00:00:00.000Z`),
      },
    },
    select: { date: true, name: true },
  });
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.name]));
}
