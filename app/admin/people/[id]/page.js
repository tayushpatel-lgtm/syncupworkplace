import Link from 'next/link';
import { requireAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { getSettings } from '../../../../lib/settings';
import { getAttendanceOverview } from '../../../../lib/attendance';
import { dayKey, dayDate, formatDayLabel, formatDuration } from '../../../../lib/dates';
import Shell from '../../../../components/Shell';
import { PageHead, Card, Empty, Stat } from '../../../../components/ui';
import MonthPicker from '../../../../components/MonthPicker';

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

const TASK_STAGES = {
  PENDING: ['Pending', 0],
  PROGRESS: ['In progress', 50],
  COMPLETED: ['Completed', 100],
  BLOCKED: ['Blocked', 25],
};

export default async function PersonAttendancePage({ params, searchParams }) {
  const user = await requireAdmin();
  const route = await params;
  const query = await searchParams;
  const range = RANGES.some(([value]) => value === query?.range) ? query.range : 'month';
  const settings = await getSettings();
  const today = dayKey();
  const days = range === 'week' ? 7 : range === 'month' ? 30 : Number(range);
  const months = monthOptions(today);
  const selectedMonth = months.some(([value]) => value === query?.month) ? query.month : months[0][0];
  const selectedMonthBounds = monthBounds(selectedMonth, today);
  const overview = await getAttendanceOverview(
    days,
    settings,
    today,
    range === 'month' ? selectedMonthBounds.start : undefined,
    range === 'month' ? selectedMonthBounds.end : undefined,
  );
  const person = overview.rows.find((row) => row.id === route.id);

  if (!person) {
    return (
      <Shell user={user}>
        <PageHead title="Person not found" subtitle="That person is not active or no longer exists." />
        <Link className="btn" href="/admin/attendance">Back to attendance</Link>
      </Shell>
    );
  }

  const monthlyStats = range === 'month'
    ? await Promise.all(Array.from({ length: 12 }, (_, index) => {
        const month = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
        month.setUTCMonth(month.getUTCMonth() - index);
        const monthStart = month.toISOString().slice(0, 7) + '-01';
        const monthEndDate = new Date(month);
        monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
        monthEndDate.setUTCDate(0);
        const monthEnd = monthEndDate.toISOString().slice(0, 10) < today
          ? monthEndDate.toISOString().slice(0, 10)
          : today;
        return getAttendanceOverview(1, settings, today, monthStart, monthEnd);
      }))
    : [];

  const [tasks, reports] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: person.id },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { attachments: true } },
      },
      take: 500,
    }),
    prisma.dailyReport.findMany({
      where: {
        userId: person.id,
        date: {
          gte: dayDate(overview.fromKey),
          lte: dayDate(today),
        },
      },
      orderBy: { date: 'desc' },
    }),
  ]);

  return (
    <Shell user={user}>
      <PageHead
        title={person.name}
        subtitle={`${formatDayLabel(overview.fromKey)} → ${formatDayLabel(today)} · ${person.department || 'No department'}`}
      >
        <Link className="btn btn-sm" href={`/admin/attendance?range=${range === 'week' ? 7 : 30}`}>← Attendance</Link>
        <div className="segmented">
          {RANGES.map(([value, label]) => (
            value === 'month' ? (
              <MonthPicker
                key={value}
                hrefBase={`/admin/people/${person.id}?range=month&month=`}
                months={months}
                selectedMonth={selectedMonth}
              />
            ) : (
              <Link key={value} href={`/admin/people/${person.id}?range=${value}`}>
                <button className={value === range ? 'on' : ''}>{label}</button>
              </Link>
            )
          ))}
        </div>
      </PageHead>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="PRESENT" value={`${person.present}/${person.expected}`} sub="working days" focus />
        <Stat label="SHORT" value={person.short} sub="below minimum hours" />
        <Stat label="ABSENT" value={person.absent} sub="working days missed" />
        <Stat label="ATTENDANCE" value={`${person.pct}%`} sub={`${formatDuration(person.minutes)} recorded`} />
      </div>

      {range === 'month' && (
        <Card title="Monthly attendance" description="Each month uses the same present, short, absent, leave and hours rules as Overview.">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th className="right">PRESENT</th>
                  <th className="right">SHORT</th>
                  <th className="right">ABSENT</th>
                  <th className="right">ON LEAVE</th>
                  <th className="right">HOURS</th>
                  <th className="right">ATTENDANCE</th>
                </tr>
              </thead>
              <tbody>
                {monthlyStats.map((month) => {
                  const row = month.rows.find((candidate) => candidate.id === person.id) || {
                    present: 0, short: 0, absent: 0, onLeave: 0, minutes: 0, pct: 0, expected: 0,
                  };
                  return (
                    <tr key={month.fromKey}>
                      <td>{formatDayLabel(month.fromKey, { month: 'long', year: 'numeric' })}</td>
                      <td className="num right">{row.present} / {row.expected}</td>
                      <td className="num right">{row.short || '—'}</td>
                      <td className="num right">{row.absent || '—'}</td>
                      <td className="num right">{row.onLeave || '—'}</td>
                      <td className="num right">{formatDuration(row.minutes)}</td>
                      <td className="num right">{row.pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid-2">
        <Card title="Attendance" description="The same period and aggregation as the overview table.">
          <div className="row wrap">
            <span className="chip green">{person.present} present</span>
            <span className="chip amber">{person.short} short</span>
            <span className="chip red">{person.absent} absent</span>
            <span className="chip">{person.late} late</span>
            <span className="chip">{person.onLeave} on leave</span>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>Hours recorded: {formatDuration(person.minutes)}</p>
        </Card>

        <Card title="Assigned tasks" description="The same task stages used by the company board.">
          {tasks.length === 0 ? <Empty>No tasks assigned.</Empty> : (
            <div className="bordered-list">
              {tasks.map((task) => {
                const [label, progress] = TASK_STAGES[task.status] || [task.status, 0];
                return (
                  <Link key={task.id} href={`/tasks/${task.id}`} className="list-row">
                    <span style={{ flex: 1 }}>{task.title}</span>
                    <span className={`chip ${task.status === 'COMPLETED' ? 'green' : task.status === 'BLOCKED' ? 'red' : ''}`}>
                      {label} · {progress}%
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Daily reports" description="Checkout reports filed during this attendance period.">
        {reports.length === 0 ? <Empty>No reports filed in this period.</Empty> : reports.map((report) => (
          <article key={report.id} className="bordered-list" style={{ padding: 16, marginBottom: 10 }}>
            <div className="card-head" style={{ marginBottom: 10 }}>
              <b>{formatDayLabel(report.date, { weekday: 'long', year: 'numeric' })}</b>
              <span className="chip">{formatDuration(report.minutesWorked)} recorded</span>
            </div>
            <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
          </article>
        ))}
      </Card>
    </Shell>
  );
}