import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { ensureBalance, remaining, currentYear } from '../../lib/leave';
import { formatDayLabel } from '../../lib/dates';
import Shell from '../../components/Shell';
import { PageHead, Card, Stat, Empty } from '../../components/ui';
import LeaveForm from './LeaveForm';

export const dynamic = 'force-dynamic';

const KIND_LABEL = { SICK: 'Sick', PLANNED: 'Planned' };
const STATUS_TONE = { APPROVED: 'green', REJECTED: 'red', PENDING: 'amber', CANCELLED: '' };

export default async function MyLeavePage() {
  const user = await requireUser();
  const year = currentYear();

  const balance = await ensureBalance(user.id, year);
  const left = remaining(balance);

  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { decider: { select: { name: true } } },
  });

  return (
    <Shell user={user}>
      <PageHead title="My leave" subtitle={`${year} · ${requests.filter((r) => r.status === 'PENDING').length} waiting on an answer`} />

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="SICK LEFT" value={left.sick} sub={`of ${balance.sickTotal} this year`} focus />
        <Stat
          label="PLANNED LEFT"
          value={left.planned}
          sub={`of ${balance.plannedTotal + balance.carried} including carried`}
        />
        <Stat label="USED" value={balance.sickUsed + balance.plannedUsed} sub="days taken this year" />
        <Stat label="CARRIED" value={balance.carried} sub="brought in from last year" />
      </div>

      <LeaveForm />

      <Card glyph="doc" title="Your requests">
        {requests.length === 0 && <Empty>You have not asked for any leave this year.</Empty>}
        {requests.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>KIND</th>
                <th>DATES</th>
                <th>DAYS</th>
                <th>REASON</th>
                <th className="right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const start = r.startDate.toISOString().slice(0, 10);
                const end = r.endDate.toISOString().slice(0, 10);
                return (
                  <tr key={r.id}>
                    <td>{KIND_LABEL[r.kind]}</td>
                    <td className="num">
                      {formatDayLabel(start)}
                      {start !== end && ` → ${formatDayLabel(end)}`}
                    </td>
                    <td className="num">{r.days}</td>
                    <td className="muted">{r.reason || '—'}</td>
                    <td className="right">
                      <span className={`chip ${STATUS_TONE[r.status]}`}>{r.status.toLowerCase()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
