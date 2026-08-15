import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import PeopleManager from './PeopleManager';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const user = await requireAdmin();
  const settings = await getSettings();

  const people = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      title: true,
      checkInBy: true,
      active: true,
      joinedAt: true,
      _count: { select: { assignedTasks: true } },
    },
  });

  const openCounts = await prisma.task.groupBy({
    by: ['assigneeId'],
    where: { status: { in: ['PENDING', 'PROGRESS'] } },
    _count: { _all: true },
  });
  const openBy = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]));

  return (
    <Shell user={user}>
      <PageHead
        title="People"
        subtitle={`${people.filter((p) => p.active).length} active · the cap is ${settings.assignmentCap} open tasks each`}
      />
      <PeopleManager
        people={people.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          department: p.department || '',
          title: p.title || '',
          checkInBy: p.checkInBy || '',
          active: p.active,
          joinedAt: p.joinedAt.toISOString().slice(0, 10),
          openTasks: openBy.get(p.id) || 0,
        }))}
        defaultCheckInBy={settings.defaultCheckInBy}
        assignmentCap={settings.assignmentCap}
        currentUserId={user.id}
        isCeo={user.role === 'CEO'}
      />
    </Shell>
  );
}
