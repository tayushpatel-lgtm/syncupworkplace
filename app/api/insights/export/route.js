import { apiUser } from '../../../../lib/auth';
import { buildInsights } from '../../../../lib/insights';

const RANGES = [7, 30, 60, 90];

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export async function GET(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const url = new URL(request.url);
  const days = RANGES.includes(Number(url.searchParams.get('range')))
    ? Number(url.searchParams.get('range'))
    : 30;

  const data = await buildInsights(days);
  const hours = (minutes) => (minutes / 60).toFixed(2);

  const rows = [
    ['Syncup insights export'],
    ['Window', `${data.fromKey} to ${data.today}`],
    ['Working days', data.workingDayCount],
    [],
    ['PER PERSON'],
    ['Name', 'Department', 'Hours worked', 'Days present', 'Days expected', 'Late', 'On leave', 'Reports filed', 'Tasks closed', 'Attendance %'],
    ...data.perPerson.map((p) => [
      p.name,
      p.department || '',
      hours(p.minutes),
      p.present,
      p.expected,
      p.late,
      p.onLeave,
      p.reports,
      p.tasksClosed,
      p.pct,
    ]),
    [],
    ['BY DAY'],
    ['Date', 'Hours worked', 'Working day'],
    ...data.series.map((s) => [s.key, hours(s.minutes), s.off ? 'no' : 'yes']),
    [],
    ['BY DEPARTMENT'],
    ['Department', 'Hours worked', 'People'],
    ...data.departments.map((d) => [d.name, hours(d.minutes), d.people]),
    [],
    ['WHERE THE TIME WENT'],
    ['Productive hours', hours(data.totals.workMinutes)],
    ['Break hours', hours(data.totals.breakMinutes)],
    ['Discarded as idle hours', hours(data.totals.idleMinutes)],
    ['Days on leave', data.totals.leaveDays],
  ];

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="syncup-insights-${data.today}-${days}d.csv"`,
    },
  });
}
