import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { setPointDone } from '../../../../lib/day';
import { dayKey, dayDate } from '../../../../lib/dates';
import { postToSlack, statusChangeMessage } from '../../../../lib/slack';

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const key = dayKey();

  if (body.action === 'add') {
    const title = String(body.title || '').trim();
    if (!title) return Response.json({ error: 'A point needs a title.' }, { status: 400 });

    const last = await prisma.planPoint.findFirst({
      where: { userId: user.id, date: dayDate(key) },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const point = await prisma.planPoint.create({
      data: {
        userId: user.id,
        date: dayDate(key),
        title,
        order: (last?.order || 0) + 1,
        originDate: dayDate(key),
      },
    });
    return Response.json({ ok: true, id: point.id });
  }

  if (body.action === 'toggle') {
    const before = await prisma.planPoint.findFirst({
      where: { id: String(body.id || ''), userId: user.id },
      include: { task: { include: { assignee: true } } },
    });
    if (!before) return Response.json({ error: 'That point is gone.' }, { status: 404 });

    const updated = await setPointDone(user.id, before.id, !!body.done);

    // Ticking a point that came from a task moves the task too — announce it once.
    if (before.task && before.task.status !== (body.done ? 'COMPLETED' : 'PROGRESS')) {
      const msg = statusChangeMessage(
        before.task,
        before.task.assignee,
        before.task.status,
        body.done ? 'COMPLETED' : 'PROGRESS',
      );
      await postToSlack('status', msg);
    }
    return Response.json({ ok: true, done: updated?.done });
  }

  if (body.action === 'dismiss') {
    // Removals stick for the day only. Tomorrow it comes back if it is still open.
    const result = await prisma.planPoint.updateMany({
      where: { id: String(body.id || ''), userId: user.id },
      data: { dismissed: true },
    });
    if (result.count === 0) return Response.json({ error: 'That point is gone.' }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}
