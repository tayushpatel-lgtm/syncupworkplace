import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { getSettings, holidayKeySet } from '../../../lib/settings';
import { getAttendanceOverview } from '../../../lib/attendance';
import { dayRoll, STATE_LABEL, STATE_TONE } from '../../../lib/roll';
import { dayKey, formatDuration, formatClock, shiftDay, formatDayLabel, timeKey } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead, Card, Stat, Person, Empty } from '../../../components/ui';
import { Icon } from '../../../components/Icons';
import MonthPicker from '../../../components/MonthPicker';
import AttendanceDayEditor from './AttendanceDayEditor';

export const dynamic = 'force-dynamic';

const RANGES = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['60', '60d'],
  ['90', '90d'],
];

function monthBounds(month, today) {
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return { start, end: next.toISOString().slice(0, 10) < today ? next.toISOString().slice(0, 10) : today };
}

function monthOptions(today) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    const value = date.toISOString().slice(0, 7);
    return [value, date.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })];
  });
}

function Tabs({ tab, dateKey, children }) {
  return (
    <>
      <div className="tabs" style={{ marginBottom: 20 }}>
        <Link href="/admin/attendance">
          <button type="button" className={`tab ${tab === 'overview' ? 'active' : ''}`}>
            <Icon.chart width={16} height={16} />
            Overview
          </button>
        </Link>
        <Link href={`/admin/attendance?tab=day&date=${dateKey}`}>
          <button type="button" className={`tab ${tab === 'day' ? 'active' : ''}`}>
            <Icon.calendar width={16} height={16} />
            By day
          </button>
        </Link>
      </div>
      {children}
    </>
  );
}

export default async function AttendancePage({ searchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const tab = params?.tab === 'day' ? 'day' : 'overview';
  const today = dayKey();

  // ---------------------------------------------------------------- By day

  if (tab === 'day') {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(params?.date || '') ? params.date : today;
    const { rows, working, holidayName } = await dayRoll(key);

    const editable = rows.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      stateLabel: STATE_LABEL[r.state],
      stateTone: STATE_TONE[r.state],
      onLeave: r.onLeave,
      late: r.late,
      deadline: r.deadline,
      deadlineLabel: formatClock(r.deadline),
      checkInTime: r.checkInAt ? timeKey(r.checkInAt) : '',
      checkOutTime: r.checkOutAt ? timeKey(r.checkOutAt) : '',
      checkInLabel: r.checkInAt ? formatClock(timeKey(r.checkInAt)) : '—',
      checkOutLabel: r.checkOutAt ? formatClock(timeKey(r.checkOutAt)) : '—',
    }));

    return (
      <Shell user={user}>
        <PageHead
          title="Attendance"
          subtitle={`${formatDayLabel(key, { weekday: 'long', year: 'numeric' })}${
            holidayName ? ` · ${holidayName}` : working ? '' : ' · not a working day'
          }`}
        >
          <Link className="btn btn-sm" href={`/admin/attendance?tab=day&date=${shiftDay(key, -1)}`}>
            ← Previous
          </Link>
          {key < today && (
            <Link className="btn btn-sm" href={`/admin/attendance?tab=day&date=${shiftDay(key, 1)}`}>
              Next →
            </Link>
          )}
          {key !== today && (
            <Link className="btn btn-sm" href="/admin/attendance?tab=day">
              Today
            </Link>
          )}
        </PageHead>

        <Tabs tab={tab} dateKey={key}>
          <Card
            glyph="edit"
            title="Fix a mistake"
            description="Correct someone's check-in or check-out time for this one day, or clear both to mark them absent. This never touches any other day."
          >
            {editable.length === 0 ? <Empty>Nobody on the books yet.</Empty> : <AttendanceDayEditor dateKey={key} rows={editable} />}
          </Card>
        </Tabs>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- Overview

  const range = RANGES.some(([value]) => value === params?.range) ? params.range : 'month';
  const days = range === 'week' ? 7 : range === 'month' ? 30 : Number(range);
  const months = monthOptions(today);
  const selectedMonth = months.some(([value]) => value === params?.month) ? params.month : months[0][0];
  const selectedMonthBounds = monthBounds(selectedMonth, today);

  const settings = await getSettings();
  const { fromKey, holidayKeys, workingKeys, rows } = await getAttendanceOverview(
    days,
    settings,
    today,
    range === 'month' ? selectedMonthBounds.start : undefined,
    range === 'month' ? selectedMonthBounds.end : undefined,
  );

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
            value === 'month' ? (
              <MonthPicker
                key={value}
                hrefBase="/admin/attendance?range=month&month="
                months={months}
                selectedMonth={selectedMonth}
              />
            ) : (
              <Link key={value} href={`/admin/attendance?range=${value}`}>
                <button className={value === range ? 'on' : ''}>{label}</button>
              </Link>
            )
          ))}
        </div>
      </PageHead>

      <Tabs tab={tab} dateKey={today}>
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
                      <Link
                        href={`/admin/people/${r.id}?range=${days === 7 ? 'week' : days === 30 ? 'month' : days}${range === 'month' ? `&month=${selectedMonth}` : ''}`}
                        className="table-person-link"
                      >
                        <Person name={r.name} sub={r.department || '—'} />
                      </Link>
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
      </Tabs>
    </Shell>
  );
}
