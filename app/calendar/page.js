import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { getSettings, holidayKeySet, presentThresholdMinutes } from '../../lib/settings';
import { dayKey, weekday, isWorkingDay, formatDuration } from '../../lib/dates';
import Shell from '../../components/Shell';
import { PageHead, Card, Stat } from '../../components/ui';

export const dynamic = 'force-dynamic';

const WEEK_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first, last: `${month}-${String(lastDay).padStart(2, '0')}`, lastDay };
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarPage({ searchParams }) {
  const user = await requireUser();
  const settings = await getSettings();
  const params = await searchParams;

  const today = dayKey();
  const month = /^\d{4}-\d{2}$/.test(params?.month || '') ? params.month : today.slice(0, 7);
  const { first, last, lastDay } = monthBounds(month);

  const [attendance, sessions, holidays, leave] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(`${first}T00:00:00.000Z`), lte: new Date(`${last}T00:00:00.000Z`) },
      },
    }),
    prisma.workSession.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(`${first}T00:00:00.000Z`), lte: new Date(`${last}T00:00:00.000Z`) },
      },
    }),
    holidayKeySet(first, last),
    prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        status: 'APPROVED',
        startDate: { lte: new Date(`${last}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${first}T00:00:00.000Z`) },
      },
    }),
  ]);

  const byDay = new Map(attendance.map((a) => [a.date.toISOString().slice(0, 10), a]));

  const workedMinutes = new Map();
  for (const s of sessions) {
    if (s.kind !== 'WORK' || !s.endedAt) continue;
    const key = s.date.toISOString().slice(0, 10);
    const mins = (s.endedAt - s.startedAt) / 60000;
    workedMinutes.set(key, (workedMinutes.get(key) || 0) + mins);
  }

  const leaveKeys = new Set();
  for (const l of leave) {
    let cursor = l.startDate.toISOString().slice(0, 10);
    const end = l.endDate.toISOString().slice(0, 10);
    while (cursor <= end) {
      leaveKeys.add(cursor);
      const d = new Date(`${cursor}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cursor = d.toISOString().slice(0, 10);
    }
  }

  const holidayKeys = new Set(holidays.keys());
  const cells = [];
  const lead = weekday(first) - 1; // Monday-first grid
  for (let i = 0; i < lead; i += 1) cells.push(null);

  const threshold = presentThresholdMinutes(user, settings);

  let presentCount = 0;
  let shortCount = 0;
  let lateCount = 0;
  let expected = 0;
  let totalMinutes = 0;

  for (let d = 1; d <= lastDay; d += 1) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    const record = byDay.get(key);
    const working = isWorkingDay(key, settings.workingDays, holidayKeys);
    const onLeave = leaveKeys.has(key);
    const minutes = Math.round(workedMinutes.get(key) || 0);
    const isToday = key === today;
    // A day still in progress hasn't earned its verdict yet — only a finished
    // day can be short of the threshold.
    const met = minutes >= threshold;

    if (working && key <= today && !onLeave) expected += 1;
    if (record?.checkInAt && !isToday) {
      if (met) presentCount += 1;
      else shortCount += 1;
    }
    if (record?.late) lateCount += 1;
    totalMinutes += minutes;

    cells.push({
      day: d,
      key,
      working,
      onLeave,
      holiday: holidays.get(key) || null,
      present: !!record?.checkInAt && (isToday || met),
      short: !!record?.checkInAt && !isToday && !met,
      late: !!record?.late,
      minutes,
      isToday,
      future: key > today,
    });
  }

  const attendancePct = expected ? Math.round((presentCount / expected) * 100) : 0;
  const monthLabel = new Date(`${first}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Shell user={user}>
      <PageHead title="My calendar" subtitle={monthLabel}>
        <Link className="btn btn-sm" href={`/calendar?month=${shiftMonth(month, -1)}`}>
          ← Previous
        </Link>
        <Link className="btn btn-sm" href={`/calendar?month=${shiftMonth(month, 1)}`}>
          Next →
        </Link>
      </PageHead>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="DAYS PRESENT" value={presentCount} sub={`of ${expected} expected so far`} focus />
        <Stat label="ATTENDANCE" value={`${attendancePct}%`} sub="working days only" />
        <Stat
          label="SHORT DAYS"
          value={shortCount}
          sub={`checked in, under ${formatDuration(threshold)}`}
        />
        <Stat label="HOURS RECORDED" value={formatDuration(totalMinutes)} sub="work time only" />
      </div>

      <Card>
        <div className="cal-grid" style={{ marginBottom: 8 }}>
          {WEEK_HEADS.map((w) => (
            <div key={w} className="cal-head">
              {w}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} className="cal-cell blank" />;
            const off = !cell.working;
            return (
              <div
                key={cell.key}
                className={`cal-cell ${off ? 'off' : ''} ${cell.isToday ? 'today' : ''}`}
              >
                <span className="d">{cell.day}</span>
                {cell.holiday && <span className="tag">{cell.holiday}</span>}
                {!cell.holiday && cell.onLeave && <span className="tag">On leave</span>}
                {!cell.holiday && !cell.onLeave && cell.present && (
                  <>
                    <span className="cal-dot" style={cell.late ? { background: 'var(--amber)' } : undefined} />
                    <span className="tag mono">{formatDuration(cell.minutes)}</span>
                  </>
                )}
                {!cell.holiday && !cell.onLeave && cell.short && (
                  <>
                    <span className="cal-dot" style={{ background: 'var(--amber)' }} />
                    <span className="tag mono" style={{ color: 'var(--amber)' }}>
                      {formatDuration(cell.minutes)} · short
                    </span>
                  </>
                )}
                {!cell.holiday &&
                  !cell.onLeave &&
                  !cell.present &&
                  !cell.short &&
                  cell.working &&
                  !cell.future && <span className="tag" style={{ color: 'var(--red)' }}>Absent</span>}
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: 20, gap: 20 }}>
          <span className="legend">
            <span className="cal-dot" /> present
          </span>
          <span className="legend">
            <span className="cal-dot" style={{ background: 'var(--amber)' }} /> late
          </span>
          <span className="legend muted">shaded cells are outside the working week</span>
        </div>
      </Card>
    </Shell>
  );
}
