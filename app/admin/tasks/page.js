import Link from 'next/link';
import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import { serialiseTask } from '../../../lib/serialise';
import { dayKey } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import TaskBoard from '../../../components/TaskBoard';
import { PageHead, Stat } from '../../../components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminTasksPage({ searchParams }) {
  const user = await requireAdmin();
  const settings = await getSettings();
  const params = await searchParams;
  const who = params?.who || '';

  const [tasks, people, openCounts] = await Promise.all([
    prisma.task.findMany({
      where: who ? { assigneeId: who } : {},
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
      take: 500,
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { status: { in: ['PENDING', 'PROGRESS'] } },
      _count: { _all: true },
    }),
  ]);

  const today = dayKey();
  const open = tasks.filter((t) => t.status === 'PENDING' || t.status === 'PROGRESS');
  const overdue = open.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today);
  const atCap = openCounts.filter((c) => c._count._all >= settings.assignmentCap).length;

  return (
    <Shell user={user}>
      <PageHead
        title="Tasks"
        subtitle={`${open.length} open across the company · the cap is ${settings.assignmentCap} each`}
      />

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <Stat label="OPEN" value={open.length} sub={`${tasks.length} in total`} focus />
        <Stat label="OVERDUE" value={overdue.length} sub="past the deadline" />
        <Stat
          label="BLOCKED"
          value={tasks.filter((t) => t.status === 'BLOCKED').length}
          sub="waiting on something"
        />
        <Stat label="AT THE CAP" value={atCap} sub="people who cannot take more" />
      </div>

      <div className="row wrap" style={{ marginBottom: 20 }}>
        <Link href="/admin/tasks">
          <span className={`chip ${who ? '' : 'solid'}`}>Everyone</span>
        </Link>
        {people.map((p) => {
          const count = openCounts.find((c) => c.assigneeId === p.id)?._count._all || 0;
          return (
            <Link key={p.id} href={`/admin/tasks?who=${p.id}`}>
              <span className={`chip ${who === p.id ? 'solid' : ''}`}>
                {p.name} · {count}
              </span>
            </Link>
          );
        })}
      </div>

      <TaskBoard
        tasks={tasks.map(serialiseTask)}
        people={people}
        currentUserId={user.id}
        today={today}
        assignable
        showAssignee
        canDelete
      />
    </Shell>
  );
}
