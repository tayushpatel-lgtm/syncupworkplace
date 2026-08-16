import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { dayRoll } from '../../../lib/roll';
import { dayKey, dayDate, shiftDay, formatDayLabel, formatDuration } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead, Card, Stat, Person, Empty } from '../../../components/ui';
import { Icon } from '../../../components/Icons';

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 120;

function ReportCard({ report, showPerson }) {
  return (
    <Card>
      <div className="card-head" style={{ marginBottom: 18 }}>
        {showPerson ? (
          <Person name={report.user.name} sub={report.user.department || '—'} />
        ) : (
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {formatDayLabel(report.date, { weekday: 'long', year: 'numeric' })}
            </h2>
          </div>
        )}
        <div className="spacer row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="chip">{formatDuration(report.minutesWorked)} recorded</span>
          {report.minutesIdle > 0 && <span className="chip">{formatDuration(report.minutesIdle)} idle</span>}
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
  );
}

export default async function DailyReportsPage({ searchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const today = dayKey();
  const tab = params?.tab === 'person' ? 'person' : 'day';

  const people = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, department: true },
    orderBy: { name: 'asc' },
  });

  const Tabs = ({ children }) => (
    <>
      <div className="tabs">
        <Link href="/admin/reports?tab=day">
          <button type="button" className={`tab ${tab === 'day' ? 'active' : ''}`}>
            <Icon.calendar width={16} height={16} />
            By day
          </button>
        </Link>
        <Link href={`/admin/reports?tab=person&person=${people[0]?.id || ''}`}>
          <button type="button" className={`tab ${tab === 'person' ? 'active' : ''}`}>
            <Icon.users width={16} height={16} />
            By person
          </button>
        </Link>
      </div>
      {children}
    </>
  );

  // ---------------------------------------------------------------- By person

  if (tab === 'person') {
    const selectedId = people.some((p) => p.id === params?.person) ? params.person : people[0]?.id;
    const selected = people.find((p) => p.id === selectedId);

    const reports = selectedId
      ? await prisma.dailyReport.findMany({
          where: { userId: selectedId },
          orderBy: { date: 'desc' },
          take: HISTORY_LIMIT,
        })
      : [];

    const totalWorked = reports.reduce((sum, r) => sum + r.minutesWorked, 0);
    const totalPoints = reports.reduce((sum, r) => sum + r.pointsDone, 0);
    const totalTasksClosed = reports.reduce((sum, r) => sum + r.tasksCompleted, 0);

    return (
      <Shell user={user}>
        <PageHead
          title="Daily reports"
          subtitle={selected ? `${selected.name} · every day they've filed, most recent first` : 'Nobody to show yet'}
        />
        <Tabs>
          <div className="row wrap" style={{ marginBottom: 20 }}>
            {people.map((p) => (
              <Link key={p.id} href={`/admin/reports?tab=person&person=${p.id}`}>
                <span className={`chip ${p.id === selectedId ? 'solid' : ''}`}>{p.name}</span>
              </Link>
            ))}
          </div>

          {selected && (
            <div className="grid-4" style={{ marginBottom: 22 }}>
              <Stat label="REPORTS ON FILE" value={reports.length} sub={`up to the last ${HISTORY_LIMIT}`} focus />
              <Stat label="HOURS REPORTED" value={formatDuration(totalWorked)} sub="across all of them" />
              <Stat label="POINTS TICKED" value={totalPoints} sub="across every plan" />
              <Stat label="TASKS CLOSED" value={totalTasksClosed} sub="across every plan" />
            </div>
          )}

          {reports.length === 0 && (
            <Card>
              <Empty>{selected ? `${selected.name} hasn't filed a report yet.` : 'No one to show.'}</Empty>
            </Card>
          )}

          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={{ ...report, date: report.date.toISOString().slice(0, 10) }}
              showPerson={false}
            />
          ))}
        </Tabs>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- By day

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

      <Tabs>
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
          <ReportCard key={report.id} report={report} showPerson />
        ))}
      </Tabs>
    </Shell>
  );
}
