import { prisma } from '../../../../lib/db';
import { apiUser, isAdmin } from '../../../../lib/auth';
import { dayKey, dayDate } from '../../../../lib/dates';
import { parseRepeatInput } from '../../../../lib/recurrence';
import { maybeSpawnOnComplete } from '../../../../lib/day';
import { postToSlack, statusChangeMessage, sendDirectMessage, statusChangeDm } from '../../../../lib/slack';

const STATUSES = ['PENDING', 'PROGRESS', 'COMPLETED', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

export async function PATCH(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true, email: true, slackUserId: true } } },
  });
  if (!task) return Response.json({ error: 'That task is gone.' }, { status: 404 });

  // Your own tasks, tasks you handed out, or anything at all if you run the place.
  const mayEdit = task.assigneeId === user.id || task.creatorId === user.id || isAdmin(user);
  if (!mayEdit) return Response.json({ error: 'That is not yours to move.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const data = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return Response.json({ error: 'Unknown status.' }, { status: 400 });
    }
    data.status = body.status;
    data.completedAt = body.status === 'COMPLETED' ? new Date() : null;
  }
  if (body.priority !== undefined && PRIORITIES.includes(body.priority)) data.priority = body.priority;
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return Response.json({ error: 'The task needs a title.' }, { status: 400 });
    data.title = title;
  }
  if (body.detail !== undefined) data.detail = String(body.detail).trim() || null;
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
  }
  if (
    body.repeat !== undefined ||
    body.repeatUntil !== undefined ||
    body.repeatWeekdays !== undefined ||
    body.repeatInterval !== undefined ||
    body.repeatCount !== undefined
  ) {
    const recurrence = parseRepeatInput(
      {
        repeat: body.repeat !== undefined ? body.repeat : task.repeat,
        repeatUntil: body.repeatUntil !== undefined ? body.repeatUntil : (task.repeatUntil ? task.repeatUntil.toISOString().slice(0, 10) : ''),
        repeatWeekdays: body.repeatWeekdays !== undefined ? body.repeatWeekdays : task.repeatWeekdays,
        repeatInterval: body.repeatInterval !== undefined ? body.repeatInterval : task.repeatInterval,
        repeatCount: body.repeatCount !== undefined ? body.repeatCount : task.repeatCount,
        dueDate: (data.dueDate || task.dueDate) ? (data.dueDate || task.dueDate).toISOString().slice(0, 10) : '',
      },
      { todayKey: dayKey() },
    );
    if (
      recurrence.repeat !== 'NONE' &&
      recurrence.repeatUntil &&
      recurrence.dueDate &&
      recurrence.repeatUntil.getTime() < recurrence.dueDate.getTime()
    ) {
      return Response.json({ error: 'The end date has to be on or after the first deadline.' }, { status: 400 });
    }
    data.repeat = recurrence.repeat;
    data.repeatUntil = recurrence.repeatUntil;
    data.repeatWeekdays = recurrence.repeatWeekdays;
    data.repeatInterval = recurrence.repeatInterval;
    data.repeatCount = recurrence.repeatCount;
    if (recurrence.repeat !== 'NONE' && !task.seriesId) data.seriesId = task.id;
    if (recurrence.repeat !== 'NONE' && data.dueDate === undefined && !task.dueDate && recurrence.dueDate) {
      data.dueDate = recurrence.dueDate;
    }
  }
  if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
    const next = await prisma.user.findFirst({ where: { id: body.assigneeId, active: true } });
    if (!next) return Response.json({ error: 'That person is not here.' }, { status: 400 });
    data.assigneeId = next.id;
  }

  const updated = await prisma.task.update({ where: { id }, data });

  // Keep today's plan point in step with the board.
  if (data.status) {
    await prisma.planPoint.updateMany({
      where: { taskId: id, date: dayDate(dayKey()) },
      data:
        data.status === 'COMPLETED'
          ? { done: true, doneAt: new Date() }
          : { done: false, doneAt: null },
    });

    if (task.status !== data.status) {
      await postToSlack('status', statusChangeMessage(updated, task.assignee, task.status, data.status));
      await sendDirectMessage('status', task.assignee, statusChangeDm(updated, task.status, data.status));
    }

    await maybeSpawnOnComplete(task, updated);
  }

  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return Response.json({ error: 'That task is gone.' }, { status: 404 });

  if (task.creatorId !== user.id && !isAdmin(user)) {
    return Response.json({ error: 'Only the person who assigned it, or an admin, can delete it.' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return Response.json({ ok: true });
}
