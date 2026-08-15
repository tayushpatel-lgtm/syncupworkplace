import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { getSettings } from '../../lib/settings';
import { serialiseTask } from '../../lib/serialise';
import { dayKey } from '../../lib/dates';
import Shell from '../../components/Shell';
import TaskBoard from '../../components/TaskBoard';
import { PageHead } from '../../components/ui';

export const dynamic = 'force-dynamic';

export default async function MyTasksPage() {
  const user = await requireUser();
  const settings = await getSettings();

  const [tasks, people] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: user.id },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const open = tasks.filter((t) => t.status === 'PENDING' || t.status === 'PROGRESS').length;

  return (
    <Shell user={user}>
      <PageHead
        title="My tasks"
        subtitle={`${open} open of ${tasks.length} · the cap is ${settings.assignmentCap} open tasks each`}
      />
      <TaskBoard
        tasks={tasks.map(serialiseTask)}
        people={people}
        currentUserId={user.id}
        today={dayKey()}
        assignable
      />
    </Shell>
  );
}
