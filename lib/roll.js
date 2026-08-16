import { prisma } from './db';
import { getSettings, checkInDeadline, holidayKeySet } from './settings';
import { dayDate, isWorkingDay, minutesOfDay, timeKey } from './dates';

/**
 * Everyone's standing on one day: whether they arrived, when, how long they have
 * recorded, how their plan is going, and what they are holding.
 */
export async function dayRoll(key) {
  const settings = await getSettings();
  const holidays = await holidayKeySet(key, key);
  const working = isWorkingDay(key, settings.workingDays, new Set(holidays.keys()));
  const date = dayDate(key);

  const [people, attendance, sessions, points, reports, openTasks, leave] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true, title: true, checkInBy: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({ where: { date } }),
    prisma.workSession.findMany({ where: { date } }),
    prisma.planPoint.groupBy({
      by: ['userId', 'done'],
      where: { date, dismissed: false },
      _count: { _all: true },
    }),
    prisma.dailyReport.findMany({ where: { date }, select: { userId: true, summary: true } }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { status: { in: ['PENDING', 'PROGRESS'] } },
      _count: { _all: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
      select: { userId: true, kind: true },
    }),
  ]);

  const attendanceBy = new Map(attendance.map((a) => [a.userId, a]));
  const reportBy = new Map(reports.map((r) => [r.userId, r]));
  const openBy = new Map(openTasks.map((t) => [t.assigneeId, t._count._all]));
  const leaveBy = new Map(leave.map((l) => [l.userId, l.kind]));

  const planBy = new Map();
  for (const row of points) {
    const entry = planBy.get(row.userId) || { done: 0, total: 0 };
    entry.total += row._count._all;
    if (row.done) entry.done += row._count._all;
    planBy.set(row.userId, entry);
  }

  const now = Date.now();
  const minutesBy = new Map();
  const runningBy = new Map();
  for (const s of sessions) {
    const end = s.endedAt ? s.endedAt.getTime() : now;
    const mins = Math.max(0, (end - s.startedAt.getTime()) / 60000);
    const entry = minutesBy.get(s.userId) || { work: 0, break: 0, idle: 0 };
    if (s.kind === 'WORK') entry.work += mins;
    else if (s.kind === 'BREAK') entry.break += mins;
    else entry.idle += mins;
    minutesBy.set(s.userId, entry);
    if (!s.endedAt) runningBy.set(s.userId, s.kind);
  }

  const nowMinutes = minutesOfDay(timeKey());

  const rows = people.map((person) => {
    const record = attendanceBy.get(person.id);
    const minutes = minutesBy.get(person.id) || { work: 0, break: 0, idle: 0 };
    const plan = planBy.get(person.id) || { done: 0, total: 0 };
    const onLeave = leaveBy.get(person.id) || null;
    const deadline = checkInDeadline(person, settings);

    // What actually happened outranks what the calendar expected — someone who
    // came in on a holiday reads as working, not as "not a working day".
    let state = 'not-in';
    if (runningBy.get(person.id) === 'WORK') state = 'working';
    else if (runningBy.get(person.id) === 'BREAK') state = 'break';
    else if (record?.checkOutAt) state = 'closed';
    else if (record?.checkInAt) state = 'idle';
    else if (onLeave) state = 'leave';
    else if (!working) state = 'off';

    return {
      id: person.id,
      name: person.name,
      department: person.department,
      title: person.title,
      role: person.role,
      state,
      onLeave,
      deadline,
      late: !!record?.late,
      // Only call someone missing once their own deadline has actually passed.
      overdue: working && !onLeave && !record?.checkInAt && nowMinutes > minutesOfDay(deadline),
      checkInAt: record?.checkInAt || null,
      checkOutAt: record?.checkOutAt || null,
      work: Math.round(minutes.work),
      break: Math.round(minutes.break),
      idle: Math.round(minutes.idle),
      plan,
      openTasks: openBy.get(person.id) || 0,
      report: reportBy.get(person.id)?.summary || null,
      filed: reportBy.has(person.id),
    };
  });

  return { rows, working, holidayName: holidays.get(key) || null, settings };
}

export const STATE_LABEL = {
  working: 'working',
  break: 'on a break',
  idle: 'checked in, clock stopped',
  closed: 'day closed',
  'not-in': 'not in yet',
  leave: 'on leave',
  off: 'not a working day',
};

const PRESENT_STATES = new Set(['working', 'break', 'idle', 'closed']);

/**
 * Who was present, who wasn't, and which task-linked plan points are still
 * unticked at end of day — the shape the Slack EOD summary sends.
 */
export async function buildEodSummary(key) {
  const { rows, working, holidayName } = await dayRoll(key);
  if (!working) return { working: false, holidayName, date: key, present: [], absent: [], notPickedUp: [] };

  const present = rows.filter((r) => PRESENT_STATES.has(r.state)).map((r) => r.name);
  const absent = rows.filter((r) => r.state === 'not-in').map((r) => r.name);

  const points = await prisma.planPoint.findMany({
    where: { date: dayDate(key), dismissed: false, taskId: { not: null }, done: false },
    include: { user: { select: { name: true } } },
    orderBy: { order: 'asc' },
  });
  const notPickedUp = points.map((p) => `${p.title} — ${p.user.name}`);

  return { working: true, holidayName, date: key, present, absent, notPickedUp };
}

export const STATE_TONE = {
  working: 'green',
  break: 'amber',
  idle: '',
  closed: '',
  'not-in': '',
  leave: '',
  off: '',
};
