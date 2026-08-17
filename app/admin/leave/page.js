import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import { monthKey } from '../../../lib/leave';
import { dayKey } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import LeaveAdmin from './LeaveAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminLeavePage() {
  const user = await requireAdmin();
  const settings = await getSettings();

  const [requests, people] = await Promise.all([
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
      select: {
        id: true,
        name: true,
        department: true,
        employmentType: true,
        casualLeaveBalance: true,
        sickLeaveBalance: true,
        lastLeaveAccrualMonth: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const thisMonth = monthKey(dayKey());
  const accruedCount = people.filter((p) => p.lastLeaveAccrualMonth === thisMonth).length;
  const waiting = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <Shell user={user}>
      <PageHead title="Leave" subtitle={`${waiting} waiting on you.`} />
      <LeaveAdmin
        workingDays={settings.workingDays}
        thisMonth={thisMonth}
        accruedCount={accruedCount}
        totalCount={people.length}
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
        rows={people.map((p) => ({
          id: p.id,
          name: p.name,
          department: p.department,
          employmentType: p.employmentType,
          casualLeft: p.casualLeaveBalance,
          sickLeft: p.sickLeaveBalance,
        }))}
      />
    </Shell>
  );
}
