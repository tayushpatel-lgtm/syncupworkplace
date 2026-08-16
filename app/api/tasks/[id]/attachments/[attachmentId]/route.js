import { prisma } from '../../../../../../lib/db';
import { apiUser, isAdmin } from '../../../../../../lib/auth';

async function taskAccess(taskId, user) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { task: null, allowed: false };
  const allowed = task.assigneeId === user.id || task.creatorId === user.id || isAdmin(user);
  return { task, allowed };
}

/** The file itself — an <img src> or a plain download hits this directly. */
export async function GET(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id, attachmentId } = await params;
  const { task, allowed } = await taskAccess(id, user);
  if (!task || !allowed) return new Response('Not found', { status: 404 });

  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId: id },
  });
  if (!attachment) return new Response('Not found', { status: 404 });

  const inline = attachment.mimeType.startsWith('image/');
  return new Response(attachment.data, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(attachment.filename)}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

export async function DELETE(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id, attachmentId } = await params;
  const { task, allowed } = await taskAccess(id, user);
  if (!task) return Response.json({ error: 'That task is gone.' }, { status: 404 });
  if (!allowed) return Response.json({ error: 'That is not yours to remove.' }, { status: 403 });

  await prisma.taskAttachment.deleteMany({ where: { id: attachmentId, taskId: id } });
  return Response.json({ ok: true });
}
