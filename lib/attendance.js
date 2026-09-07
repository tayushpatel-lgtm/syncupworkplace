import { prisma } from './db';
import { holidayKeySet, presentThresholdMinutes } from './settings';
import { dayKey, rangeKeys, isWorkingDay, shiftDay } from './dates';

export async function getAttendanceOverview(days, settings, today = dayKey(), fromKeyOverride, toKeyOverride) {
  const fromKey = fromKeyOverride || shiftDay(today, -(days - 1));
  const toKey = toKeyOverride || today;
  const holidays = await holidayKeySet(fromKey, toKey);
  const holidayKeys = new Set(holidays.keys());
  const workingKeys = rangeKeys(fromKey, toKey).filter((key) =>
    isWorkingDay(key, settings.workingDays, holidayKeys),
  );

  const [people, attendance, sessions, leave] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true, checkInBy: true, minPresentMinutes: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: new Date(`${fromKey}T00:00:00.000Z`), lte: new Date(`${toKey}T00:00:00.000Z`) },
      },
    }),
    prisma.workSession.findMany({
      where: {
        kind: 'WORK',
        endedAt: { not: null },
        date: { gte: new Date(`${fromKey}T00:00:00.000Z`), lte: new Date(`${toKey}T00:00:00.000Z`) },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: new Date(`${toKey}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${fromKey}T00:00:00.000Z`) },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const usersById = new Map(people.map((person) => [person.id, person]));
  const minutesBy = new Map();
  const perPersonDayMinutes = new Map();
  for (const session of sessions) {
    const minutes = (session.endedAt - session.startedAt) / 60000;
    minutesBy.set(session.userId, (minutesBy.get(session.userId) || 0) + minutes);
    const key = session.date.toISOString().slice(0, 10);
    const pairKey = `${session.userId}::${key}`;
    perPersonDayMinutes.set(pairKey, (perPersonDayMinutes.get(pairKey) || 0) + minutes);
  }

  const presentBy = new Map();
  const shortByCount = new Map();
  const lateBy = new Map();
  for (const record of attendance) {
    if (!record.checkInAt) continue;
    const key = record.date.toISOString().slice(0, 10);
    if (key !== today || toKey !== today) {
      const person = usersById.get(record.userId);
      const worked = perPersonDayMinutes.get(`${record.userId}::${key}`) || 0;
      const threshold = person ? presentThresholdMinutes(person, settings) : settings.minPresentMinutes;
      if (worked >= threshold) presentBy.set(record.userId, (presentBy.get(record.userId) || 0) + 1);
      else shortByCount.set(record.userId, (shortByCount.get(record.userId) || 0) + 1);
    } else {
      presentBy.set(record.userId, (presentBy.get(record.userId) || 0) + 1);
    }
    if (record.late) lateBy.set(record.userId, (lateBy.get(record.userId) || 0) + 1);
  }

  const leaveBy = new Map();
  for (const request of leave) {
    const start = request.startDate.toISOString().slice(0, 10);
    const end = request.endDate.toISOString().slice(0, 10);
    const count = workingKeys.filter((key) => key >= start && key <= end).length;
    leaveBy.set(request.userId, (leaveBy.get(request.userId) || 0) + count);
  }

  const rows = people
    .map((person) => {
      const onLeave = leaveBy.get(person.id) || 0;
      const expected = Math.max(0, workingKeys.length - onLeave);
      const present = presentBy.get(person.id) || 0;
      const short = shortByCount.get(person.id) || 0;
      const minutes = Math.round(minutesBy.get(person.id) || 0);
      return {
        ...person,
        expected,
        present,
        short,
        onLeave,
        late: lateBy.get(person.id) || 0,
        absent: Math.max(0, expected - present - short),
        minutes,
        pct: expected ? Math.round((present / expected) * 100) : 0,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  return { fromKey, toKey, today, holidayKeys, workingKeys, rows };
}