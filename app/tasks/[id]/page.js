import { notFound } from 'next/navigation';
import { requireUser, isAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import Shell from '../../../components/Shell';
import { PageHead, Card, Empty } from '../../../components/ui';
import TaskDetail from './TaskDetail';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({ params }) {
  const user = await requireUser();
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });
  if (!task) notFound();

  const allowed = task.assigneeId === user.id || task.creatorId === user.id || isAdmin(user);

  if (!allowed) {
    return (
      <Shell user={user}>
        <PageHead title="Task" />
        <Card>
          <Empty>That task belongs to someone else — only the assignee, whoever assigned it, or an admin can open it.</Empty>
        </Card>
      </Shell>
    );
  }

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId: id },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <Shell user={user}>
      <TaskDetail
        task={{
          id: task.id,
          title: task.title,
          detail: task.detail,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : '',
          repeat: task.repeat || 'NONE',
          repeatUntil: task.repeatUntil ? task.repeatUntil.toISOString().slice(0, 10) : '',
          repeatWeekdays: task.repeatWeekdays || [],
          repeatInterval: task.repeatInterval || 1,
          repeatCount: task.repeatCount || '',
          seriesId: task.seriesId || null,
          assignee: task.assignee,
          creator: task.creator,
          createdAt: task.createdAt.toISOString(),
        }}
        attachments={attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          createdAt: a.createdAt.toISOString(),
          uploadedBy: a.uploadedBy.name,
        }))}
        canDelete={task.creatorId === user.id || isAdmin(user)}
      />
    </Shell>
  );
}
