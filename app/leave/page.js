import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { formatDayLabel, dayKey, shiftDay } from '../../lib/dates';
import Shell from '../../components/Shell';
import { PageHead, Card, Stat, Empty } from '../../components/ui';
import LeaveForm from './LeaveForm';

export const dynamic = 'force-dynamic';

const KIND_LABEL = { SICK: 'Sick', PLANNED: 'Casual' };
const STATUS_TONE = { APPROVED: 'green', REJECTED: 'red', PENDING: 'amber', CANCELLED: '' };

export default async function MyLeavePage() {
  const user = await requireUser();
  const isFreelancer = user.employmentType === 'FREELANCER';

  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { decider: { select: { name: true } } },
  });

  return (
    <Shell user={user}>
      <PageHead
        title="My leave"
        subtitle={`${requests.filter((r) => r.status === 'PENDING').length} waiting on an answer`}
      />

      {isFreelancer ? (
        <Card glyph="doc" title="No leave policy on a freelance account" description="Freelancer accounts don't accrue casual or sick leave — the weekly off is the only day off.">
          {requests.length === 0 && <Empty>Nothing filed.</Empty>}
        </Card>
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 22 }}>
            <Stat label="CASUAL LEFT" value={user.casualLeaveBalance} sub="caps at 6 banked" focus />
            <Stat label="SICK LEFT" value={user.sickLeaveBalance} sub="resets every month, unused lapses" />
          </div>

          <LeaveForm today={dayKey()} minCasualDate={shiftDay(dayKey(), 2)} />
        </>
      )}

      <Card glyph="doc" title="Your requests">
        {requests.length === 0 && <Empty>You have not asked for any leave.</Empty>}
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
