import { prisma } from './db';
import { getSettings, holidayKeySet, presentThresholdMinutes } from './settings';
import { dayKey, shiftDay, rangeKeys, isWorkingDay } from './dates';

/**
 * Sequential ramp for magnitude — one hue, light to dark, validated against a
 * white surface (monotone lightness, ≥0.06 steps, light end clears 2:1).
 * Red/amber/green stay reserved for status and never encode a quantity.
 */
export const MAGNITUDE_RAMP = ['#63c3a0', '#2ba97c', '#158a63', '#0d6b4c', '#064e37'];

/**
 * Steps a value onto the ramp. The scale runs across the values actually present,
 * not from zero — a month of similar days would otherwise paint every bar the same
 * shade and say nothing.
 */
export function rampColor(value, max, min = 0) {
  if (value <= 0 || !max) return 'var(--line)';
  const span = max - min;
  const t = span > 0 ? (value - min) / span : 1;
  const idx = Math.min(MAGNITUDE_RAMP.length - 1, Math.floor(t * MAGNITUDE_RAMP.length - 1e-9));
  return MAGNITUDE_RAMP[Math.max(0, idx)];
}

/** Everything the Insights page reads, for one rolling window. */
export async function buildInsights(days) {
  const settings = await getSettings();
  const today = dayKey();
  const fromKey = shiftDay(today, -(days - 1));
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${today}T00:00:00.000Z`);

  const holidays = await holidayKeySet(fromKey, today);
  const holidayKeys = new Set(holidays.keys());
  const allKeys = rangeKeys(fromKey, today);
  const workingKeys = allKeys.filter((k) => isWorkingDay(k, settings.workingDays, holidayKeys));

  const [people, sessions, attendance, leave, tasks, reports] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true, title: true, minPresentMinutes: true },
      orderBy: { name: 'asc' },
    }),
    prisma.workSession.findMany({
      where: { date: { gte: from, lte: to }, endedAt: { not: null } },
      select: { userId: true, date: true, kind: true, startedAt: true, endedAt: true },
    }),
    prisma.attendance.findMany({ where: { date: { gte: from, lte: to } } }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: to }, endDate: { gte: from } },
      select: { userId: true, startDate: true, endDate: true, days: true },
    }),
    prisma.task.findMany({
      where: { OR: [{ createdAt: { gte: from } }, { completedAt: { gte: from } }, { status: { in: ['PENDING', 'PROGRESS', 'BLOCKED'] } }] },
      select: {
        id: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        assigneeId: true,
      },
    }),
    prisma.dailyReport.findMany({
      where: { date: { gte: from, lte: to } },
      select: { userId: true, date: true },
    }),
  ]);

  // ---- time, split by kind ------------------------------------------------
  const byDay = new Map(allKeys.map((k) => [k, 0]));
  const byPerson = new Map();
  const byDept = new Map();
  const workedPairs = new Set();
  const totals = { work: 0, break: 0, idle: 0 };
  const deptOf = new Map(people.map((p) => [p.id, p.department || '—']));
  // Per person, per day — the figure the presence threshold actually checks against.
  const perPersonDayMinutes = new Map();

  for (const s of sessions) {
    const minutes = Math.max(0, (s.endedAt - s.startedAt) / 60000);
    const key = s.date.toISOString().slice(0, 10);

    if (s.kind === 'WORK') {
      totals.work += minutes;
      byDay.set(key, (byDay.get(key) || 0) + minutes);
      byPerson.set(s.userId, (byPerson.get(s.userId) || 0) + minutes);
      const dept = deptOf.get(s.userId) || '—';
      byDept.set(dept, (byDept.get(dept) || 0) + minutes);
      if (minutes > 0) workedPairs.add(`${s.userId}::${key}`);
      const dayKeyPair = `${s.userId}::${key}`;
      perPersonDayMinutes.set(dayKeyPair, (perPersonDayMinutes.get(dayKeyPair) || 0) + minutes);
    } else if (s.kind === 'BREAK') totals.break += minutes;
    else totals.idle += minutes;
  }

  // ---- attendance -----------------------------------------------------------
  // Present means checked in AND met that day's minimum-hours threshold — not
  // just checked in. A person who checks in and barely works isn't present.
  const usersById = new Map(people.map((p) => [p.id, p]));
  const presentBy = new Map();
  const lateBy = new Map();
  const shortBy = new Map();
  let lateTotal = 0;
  for (const a of attendance) {
    if (!a.checkInAt) continue;
    const key = a.date.toISOString().slice(0, 10);
    const person = usersById.get(a.userId);
    const worked = perPersonDayMinutes.get(`${a.userId}::${key}`) || 0;
    const threshold = person ? presentThresholdMinutes(person, settings) : settings.minPresentMinutes;

    if (worked >= threshold) {
      presentBy.set(a.userId, (presentBy.get(a.userId) || 0) + 1);
    } else {
      shortBy.set(a.userId, (shortBy.get(a.userId) || 0) + 1);
    }
    if (a.late) {
      lateBy.set(a.userId, (lateBy.get(a.userId) || 0) + 1);
      lateTotal += 1;
    }
  }

  const leaveBy = new Map();
  let leaveDays = 0;
  for (const l of leave) {
    const start = l.startDate.toISOString().slice(0, 10);
    const end = l.endDate.toISOString().slice(0, 10);
    const count = workingKeys.filter((k) => k >= start && k <= end).length;
    leaveBy.set(l.userId, (leaveBy.get(l.userId) || 0) + count);
    leaveDays += count;
  }

  const reportsBy = new Map();
  for (const r of reports) reportsBy.set(r.userId, (reportsBy.get(r.userId) || 0) + 1);

  const expectedTotal = people.reduce(
    (sum, p) => sum + Math.max(0, workingKeys.length - (leaveBy.get(p.id) || 0)),
    0,
  );
  const presentTotal = [...presentBy.values()].reduce((a, b) => a + b, 0);

  // ---- tasks --------------------------------------------------------------
  const completedInWindow = tasks.filter(
    (t) => t.completedAt && t.completedAt >= from,
  );
  const openNow = tasks.filter((t) => t.status === 'PENDING' || t.status === 'PROGRESS');
  const closeDurations = completedInWindow
    .map((t) => (t.completedAt - t.createdAt) / 86400000)
    .filter((d) => d >= 0);

  const tasksBy = new Map();
  for (const t of completedInWindow) {
    tasksBy.set(t.assigneeId, (tasksBy.get(t.assigneeId) || 0) + 1);
  }

  const priorityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const t of openNow) priorityCounts[t.priority] += 1;

  const maxDay = Math.max(1, ...byDay.values());

  return {
    settings,
    fromKey,
    today,
    days,
    workingDayCount: workingKeys.length,
    holidayKeys,
    people,

    totals: {
      workMinutes: Math.round(totals.work),
      breakMinutes: Math.round(totals.break),
      idleMinutes: Math.round(totals.idle),
      leaveDays,
    },
    contributors: byPerson.size,
    headcount: people.length,
    averagePerPerson: people.length ? totals.work / people.length : 0,
    averageWorkedDay: workedPairs.size ? totals.work / workedPairs.size : 0,
    attendancePct: expectedTotal ? Math.round((presentTotal / expectedTotal) * 100) : 0,
    lateTotal,

    series: allKeys.map((key) => ({
      key,
      minutes: Math.round(byDay.get(key) || 0),
      off: !isWorkingDay(key, settings.workingDays, holidayKeys),
      holiday: holidays.get(key) || null,
      max: maxDay,
    })),

    departments: [...byDept.entries()]
      .map(([name, minutes]) => ({
        name,
        minutes: Math.round(minutes),
        people: people.filter((p) => (p.department || '—') === name).length,
      }))
      .sort((a, b) => b.minutes - a.minutes),

    perPerson: people
      .map((p) => {
        const onLeave = leaveBy.get(p.id) || 0;
        const expected = Math.max(0, workingKeys.length - onLeave);
        const present = presentBy.get(p.id) || 0;
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          minutes: Math.round(byPerson.get(p.id) || 0),
          present,
          expected,
          late: lateBy.get(p.id) || 0,
          short: shortBy.get(p.id) || 0,
          onLeave,
          reports: reportsBy.get(p.id) || 0,
          tasksClosed: tasksBy.get(p.id) || 0,
          pct: expected ? Math.round((present / expected) * 100) : 0,
        };
      })
      .sort((a, b) => b.minutes - a.minutes),

    work: {
      completed: completedInWindow.length,
      open: openNow.length,
      blocked: tasks.filter((t) => t.status === 'BLOCKED').length,
      overdue: openNow.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today)
        .length,
      averageCloseDays: closeDurations.length
        ? closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length
        : 0,
      priorityCounts,
    },
  };
}
