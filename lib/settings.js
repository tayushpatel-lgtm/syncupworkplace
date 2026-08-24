import { prisma } from './db';

export const SETTINGS_ID = 1;

let openIndexEnsured = false;

/** Prisma 6 cannot declare UNIQUE (userId) WHERE endedAt IS NULL in the schema. */
async function ensureOpenSessionIndex() {
  if (openIndexEnsured) return;
  try {
    // Leave at most one open session per person, then stamp openUserId so the
    // unique column matches, then create the partial unique index the schema
    // language cannot express.
    await prisma.$executeRawUnsafe(`
      UPDATE "WorkSession" AS w
      SET "endedAt" = COALESCE(w."lastBeatAt", w."startedAt"),
          "openUserId" = NULL
      WHERE w."endedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "WorkSession" AS newer
          WHERE newer."userId" = w."userId"
            AND newer."endedAt" IS NULL
            AND newer."startedAt" > w."startedAt"
        )
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "WorkSession"
      SET "openUserId" = "userId"
      WHERE "endedAt" IS NULL AND "openUserId" IS NULL
    `);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WorkSession_userId_open_key" ON "WorkSession" ("userId") WHERE "endedAt" IS NULL`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WorkSession_openUserId_key" ON "WorkSession" ("openUserId")`,
    );
  } catch {
    /* first boot before the table exists */
  }
  openIndexEnsured = true;
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
  slackDmOnStaleBreak: false,
  slackDmOnDailyPlan: false,
  slackDmOnCheckInSoon: true,
  slackDmOnCheckin: true,
  slackDmOnCheckout: true,
  slackDmOnStatus: true,
  slackDmOnDeadline: true,
  sheetsEnabled: false,
  idleAfterMinutes: 30,
  staleBreakAlertMinutes: 30,
  minPresentMinutes: 240,
};

/** The settings row, created on first read so a fresh deployment just works. */
export async function getSettings() {
  await ensureOpenSessionIndex();
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
