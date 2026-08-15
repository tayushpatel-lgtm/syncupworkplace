import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import { currentYear } from '../../../lib/leave';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import LeaveAdmin from './LeaveAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminLeavePage() {
  const user = await requireAdmin();
  const settings = await getSettings();
  const year = currentYear();

  const [requests, people, balances] = await Promise.all([
    prisma.leaveRequest.findMany({
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
      include: {
        user: { select: { id: true, name: true, department: true } },
        decider: { select: { name: true } },
      },
      take: 300,
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leaveBalance.findMany({ where: { year } }),
  ]);

  const balanceBy = new Map(balances.map((b) => [b.userId, b]));
  const waiting = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <Shell user={user}>
      <PageHead title="Leave" subtitle={`${waiting} waiting on you.`} />
      <LeaveAdmin
        year={year}
        workingDays={settings.workingDays}
        requests={requests.map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          days: r.days,
          reason: r.reason,
          note: r.note,
          startDate: r.startDate.toISOString().slice(0, 10),
          endDate: r.endDate.toISOString().slice(0, 10),
          user: r.user,
          decider: r.decider?.name || null,
        }))}
        rows={people.map((p) => {
          const b = balanceBy.get(p.id);
          return {
            id: p.id,
            name: p.name,
            department: p.department,
            sickLeft: b ? Math.max(0, b.sickTotal - b.sickUsed) : 12,
            used: b ? b.sickUsed + b.plannedUsed : 0,
            plannedLeft: b ? Math.max(0, b.plannedTotal + b.carried - b.plannedUsed) : 12,
            carried: b?.carried || 0,
          };
        })}
      />
    </Shell>
  );
}
