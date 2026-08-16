import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { getSettings } from '../../../lib/settings';
import { openTaskCount, buildPlan } from '../../../lib/day';
import { dayKey } from '../../../lib/dates';
import { postToSlack, taskAssignedMessage, sendDirectMessage, taskAssignedDm } from '../../../lib/slack';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const assigneeId = String(body.assigneeId || '').trim();
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'MEDIUM';

  if (!title) return Response.json({ error: 'The task needs a title.' }, { status: 400 });
  if (!assigneeId) return Response.json({ error: 'Pick who is doing it.' }, { status: 400 });

  const assignee = await prisma.user.findFirst({ where: { id: assigneeId, active: true } });
  if (!assignee) return Response.json({ error: 'That person is not here.' }, { status: 400 });

  // The cap is per person, not company-wide.
  const settings = await getSettings();
  const open = await openTaskCount(assigneeId);
  if (open >= settings.assignmentCap) {
    return Response.json(
      {
        error: `${assignee.name} is holding ${open} open tasks, and the cap is ${settings.assignmentCap}. Something has to close first.`,
      },
      { status: 409 },
    );
  }

  const task = await prisma.task.create({
    data: {
      title,
      detail: String(body.detail || '').trim() || null,
      priority,
      dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null,
      assigneeId,
      creatorId: user.id,
    },
  });

  // It should show up on their plan today, not only tomorrow.
  await buildPlan(assignee, dayKey(), settings);
  await postToSlack('assign', taskAssignedMessage(task, assignee, user));
  await sendDirectMessage('assign', assignee, taskAssignedDm(task, user));

  return Response.json({ ok: true, id: task.id });
}

export async function GET(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const url = new URL(request.url);
  const mine = url.searchParams.get('mine') === '1';

  const tasks = await prisma.task.findMany({
    where: mine ? { assigneeId: user.id } : {},
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
    take: 500,
  });

  return Response.json({ tasks });
}
