import { requireAdmin } from '../../lib/auth';
import { dayRoll, STATE_LABEL, STATE_TONE } from '../../lib/roll';
import { dayKey, formatDayLabel, formatDuration, formatClock } from '../../lib/dates';
import Shell from '../../components/Shell';
import { PageHead, Card, Stat, Person, Empty } from '../../components/ui';

export const dynamic = 'force-dynamic';

function timeOf(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function OperationsPage() {
  const user = await requireAdmin();
  const key = dayKey();
  const { rows, working, holidayName } = await dayRoll(key);

  const inToday = rows.filter((r) => r.checkInAt).length;
  const lateToday = rows.filter((r) => r.late).length;
  const missing = rows.filter((r) => r.overdue);
  const onLeave = rows.filter((r) => r.onLeave);
  const filed = rows.filter((r) => r.filed).length;
  const totalWork = rows.reduce((sum, r) => sum + r.work, 0);
  const expected = rows.filter((r) => !r.onLeave).length;

  return (
    <Shell user={user}>
      <PageHead
        title="Operations"
        subtitle={`${formatDayLabel(key, { weekday: 'long', year: 'numeric' })}${
          holidayName ? ` · ${holidayName}` : working ? '' : ' · not a working day'
        }`}
      />

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat
          label="IN TODAY"
          value={`${inToday}/${expected}`}
          sub={onLeave.length ? `${onLeave.length} on leave` : 'everyone expected'}
          focus
        />
        <Stat label="LATE ARRIVALS" value={lateToday} sub="past their own check-in time" />
        <Stat label="HOURS SO FAR" value={formatDuration(totalWork)} sub="recorded work, live" />
        <Stat label="REPORTS FILED" value={`${filed}/${inToday || 0}`} sub="of the people who came in" />
      </div>

      {missing.length > 0 && (
        <Card
          glyph="clock"
          title={`${missing.length} ${missing.length === 1 ? 'person is' : 'people are'} past their check-in time`}
          description="Their own deadline has gone by and nothing has been recorded today."
        >
          <div className="row wrap">
            {missing.map((r) => (
              <span key={r.id} className="chip amber">
                {r.name} · expected {formatClock(r.deadline)}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card glyph="users" title="The floor" description="Where everyone stands right now.">
        {rows.length === 0 && <Empty>Nobody on the books yet.</Empty>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>PERSON</th>
                <th>STATE</th>
                <th>IN</th>
                <th>RECORDED</th>
                <th>IDLE</th>
                <th>PLAN</th>
                <th className="right">OPEN TASKS</th>
                <th className="right">REPORT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Person name={r.name} sub={r.department || r.title || '—'} />
                  </td>
                  <td>
                    <span className={`chip ${STATE_TONE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  </td>
                  <td className="num">
                    {timeOf(r.checkInAt)}
                    {r.late && <span className="chip amber" style={{ marginLeft: 8 }}>late</span>}
                  </td>
                  <td className="num">{formatDuration(r.work)}</td>
                  <td className="num muted">{r.idle ? formatDuration(r.idle) : '—'}</td>
                  <td className="num">
                    {r.plan.total ? `${r.plan.done}/${r.plan.total}` : '—'}
                  </td>
                  <td className="num right">{r.openTasks}</td>
                  <td className="right">
                    {r.filed ? (
                      <span className="chip green">filed</span>
                    ) : r.checkInAt ? (
                      <span className="chip">open</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
