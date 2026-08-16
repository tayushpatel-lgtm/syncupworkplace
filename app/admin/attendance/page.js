import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings, holidayKeySet, presentThresholdMinutes } from '../../../lib/settings';
import { dayKey, rangeKeys, isWorkingDay, formatDuration, shiftDay, formatDayLabel } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead, Card, Stat, Person, Empty } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const RANGES = [
  ['7', '7d'],
  ['30', '30d'],
  ['60', '60d'],
  ['90', '90d'],
];

export default async function AttendancePage({ searchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const days = RANGES.some(([v]) => v === params?.range) ? Number(params.range) : 30;

  const settings = await getSettings();
  const today = dayKey();
  const fromKey = shiftDay(today, -(days - 1));

  const holidays = await holidayKeySet(fromKey, today);
  const holidayKeys = new Set(holidays.keys());
  const workingKeys = rangeKeys(fromKey, today).filter((k) =>
    isWorkingDay(k, settings.workingDays, holidayKeys),
  );

  const [people, attendance, sessions, leave] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true, checkInBy: true, minPresentMinutes: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: new Date(`${fromKey}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) },
      },
    }),
    prisma.workSession.findMany({
      where: {
        kind: 'WORK',
        endedAt: { not: null },
        date: { gte: new Date(`${fromKey}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: new Date(`${today}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${fromKey}T00:00:00.000Z`) },
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const usersById = new Map(people.map((p) => [p.id, p]));
  const minutesBy = new Map();
  const perPersonDayMinutes = new Map();
  for (const s of sessions) {
    const mins = (s.endedAt - s.startedAt) / 60000;
    minutesBy.set(s.userId, (minutesBy.get(s.userId) || 0) + mins);
    const key = s.date.toISOString().slice(0, 10);
    const pairKey = `${s.userId}::${key}`;
    perPersonDayMinutes.set(pairKey, (perPersonDayMinutes.get(pairKey) || 0) + mins);
  }

  // Present means checked in AND met that day's minimum-hours threshold, not
  // just checked in. A day still in progress (today) hasn't earned its verdict.
  const presentBy = new Map();
  const shortByCount = new Map();
  const lateBy = new Map();
  for (const a of attendance) {
    if (!a.checkInAt) continue;
    const key = a.date.toISOString().slice(0, 10);
    if (key !== today) {
      const person = usersById.get(a.userId);
      const worked = perPersonDayMinutes.get(`${a.userId}::${key}`) || 0;
      const threshold = person ? presentThresholdMinutes(person, settings) : settings.minPresentMinutes;
      if (worked >= threshold) presentBy.set(a.userId, (presentBy.get(a.userId) || 0) + 1);
      else shortByCount.set(a.userId, (shortByCount.get(a.userId) || 0) + 1);
    } else {
      // Today counts toward present optimistically — it can still be met before the day ends.
      presentBy.set(a.userId, (presentBy.get(a.userId) || 0) + 1);
    }
    if (a.late) lateBy.set(a.userId, (lateBy.get(a.userId) || 0) + 1);
  }

  // Leave days inside the window come out of the denominator — you can't be
  // marked absent on a day the company approved you off.
  const leaveBy = new Map();
  for (const l of leave) {
    const start = l.startDate.toISOString().slice(0, 10);
    const end = l.endDate.toISOString().slice(0, 10);
    const count = workingKeys.filter((k) => k >= start && k <= end).length;
    leaveBy.set(l.userId, (leaveBy.get(l.userId) || 0) + count);
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

  const companyPct = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length)
    : 0;

  return (
    <Shell user={user}>
      <PageHead
        title="Attendance"
        subtitle={`${formatDayLabel(fromKey)} → ${formatDayLabel(today)} · ${workingKeys.length} working days · present means ${formatDuration(settings.minPresentMinutes)}+ recorded`}
      >
        <div className="segmented">
          {RANGES.map(([value, label]) => (
            <Link key={value} href={`/admin/attendance?range=${value}`}>
              <button className={Number(value) === days ? 'on' : ''}>{label}</button>
            </Link>
          ))}
        </div>
      </PageHead>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="COMPANY ATTENDANCE" value={`${companyPct}%`} sub="average across everyone" focus />
        <Stat label="WORKING DAYS" value={workingKeys.length} sub={`${holidayKeys.size} holidays skipped`} />
        <Stat
          label="LATE ARRIVALS"
          value={rows.reduce((sum, r) => sum + r.late, 0)}
          sub="past their own time"
        />
        <Stat
          label="HOURS RECORDED"
          value={formatDuration(rows.reduce((sum, r) => sum + r.minutes, 0))}
          sub="closed work sessions"
        />
      </div>

      <Card>
        {rows.length === 0 && <Empty>Nobody on the books yet.</Empty>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>PERSON</th>
                <th className="right">PRESENT</th>
                <th className="right">SHORT</th>
                <th className="right">ABSENT</th>
                <th className="right">LATE</th>
                <th className="right">ON LEAVE</th>
                <th className="right">HOURS</th>
                <th className="right">ATTENDANCE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Person name={r.name} sub={r.department || '—'} />
                  </td>
                  <td className="num right">
                    {r.present}
                    <span className="muted"> / {r.expected}</span>
                  </td>
                  <td className="num right">
                    {r.short > 0 ? <span style={{ color: 'var(--amber)' }}>{r.short}</span> : '—'}
                  </td>
                  <td className="num right">
                    {r.absent > 0 ? <span style={{ color: 'var(--red)' }}>{r.absent}</span> : '—'}
                  </td>
                  <td className="num right">
                    {r.late > 0 ? <span style={{ color: 'var(--amber)' }}>{r.late}</span> : '—'}
                  </td>
                  <td className="num right muted">{r.onLeave || '—'}</td>
                  <td className="num right">{formatDuration(r.minutes)}</td>
                  <td className="num right">
                    <span
                      className={`chip ${r.pct >= 90 ? 'green' : r.pct >= 70 ? 'amber' : 'red'}`}
                    >
                      {r.pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
