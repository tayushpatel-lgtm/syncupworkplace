import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { dayRoll } from '../../../lib/roll';
import { dayKey, dayDate, shiftDay, formatDayLabel, formatDuration } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead, Card, Stat, Person, Empty } from '../../../components/ui';

export const dynamic = 'force-dynamic';

export default async function DailyReportsPage({ searchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const today = dayKey();
  const key = /^\d{4}-\d{2}-\d{2}$/.test(params?.date || '') ? params.date : today;

  const [reports, { rows }] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { date: dayDate(key) },
      include: { user: { select: { id: true, name: true, department: true } } },
      orderBy: { submittedAt: 'asc' },
    }),
    dayRoll(key),
  ]);

  const filedIds = new Set(reports.map((r) => r.userId));
  // Missing means: they worked and never filed. People on leave are not chased.
  const missing = rows.filter((r) => r.checkInAt && !filedIds.has(r.id));

  const totalWorked = reports.reduce((sum, r) => sum + r.minutesWorked, 0);
  const totalPoints = reports.reduce((sum, r) => sum + r.pointsDone, 0);

  return (
    <Shell user={user}>
      <PageHead title="Daily reports" subtitle={formatDayLabel(key, { weekday: 'long', year: 'numeric' })}>
        <Link className="btn btn-sm" href={`/admin/reports?date=${shiftDay(key, -1)}`}>
          ← Previous
        </Link>
        {key < today && (
          <Link className="btn btn-sm" href={`/admin/reports?date=${shiftDay(key, 1)}`}>
            Next →
          </Link>
        )}
        {key !== today && (
          <Link className="btn btn-sm" href="/admin/reports">
            Today
          </Link>
        )}
      </PageHead>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="FILED" value={reports.length} sub={`${missing.length} still missing`} focus />
        <Stat label="HOURS REPORTED" value={formatDuration(totalWorked)} sub="recorded work time" />
        <Stat label="POINTS TICKED" value={totalPoints} sub="across every plan" />
        <Stat
          label="TASKS CLOSED"
          value={reports.reduce((sum, r) => sum + r.tasksCompleted, 0)}
          sub="on this day"
        />
      </div>

      {missing.length > 0 && (
        <Card
          glyph="edit"
          title={`${missing.length} report${missing.length === 1 ? '' : 's'} missing`}
          description="These are the days someone rushed off — which are usually the ones worth reading."
        >
          <div className="row wrap">
            {missing.map((r) => (
              <span key={r.id} className="chip amber">
                {r.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {reports.length === 0 && (
        <Card>
          <Empty>Nothing filed for this day.</Empty>
        </Card>
      )}

      {reports.map((report) => (
        <Card key={report.id}>
          <div className="card-head" style={{ marginBottom: 18 }}>
            <Person name={report.user.name} sub={report.user.department || '—'} />
            <div className="spacer row" style={{ gap: 10 }}>
              <span className="chip">{formatDuration(report.minutesWorked)} recorded</span>
              {report.minutesIdle > 0 && (
                <span className="chip">{formatDuration(report.minutesIdle)} idle</span>
              )}
              <span className={`chip ${report.pointsDone === report.pointsTotal ? 'green' : ''}`}>
                {report.pointsDone}/{report.pointsTotal} points
              </span>
              {report.tasksCompleted > 0 && (
                <span className="chip green">{report.tasksCompleted} tasks closed</span>
              )}
            </div>
          </div>
          <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{report.summary}</p>
        </Card>
      ))}
    </Shell>
  );
}
