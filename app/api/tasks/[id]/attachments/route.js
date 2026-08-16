import { prisma } from '../../../../../lib/db';
import { apiUser, isAdmin } from '../../../../../lib/auth';

// Kept modest since these live as bytes in the same Postgres database, not a
// dedicated file store — fine for a team task tool, not for video files.
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

async function taskAccess(taskId, user) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { task: null, allowed: false };
  const allowed = task.assigneeId === user.id || task.creatorId === user.id || isAdmin(user);
  return { task, allowed };
}

export async function GET(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const { task, allowed } = await taskAccess(id, user);
  if (!task) return Response.json({ error: 'That task is gone.' }, { status: 404 });
  if (!allowed) return Response.json({ error: 'That is not yours to see.' }, { status: 403 });

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

  return Response.json({ attachments });
}

export async function POST(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const { task, allowed } = await taskAccess(id, user);
  if (!task) return Response.json({ error: 'That task is gone.' }, { status: 404 });
  if (!allowed) return Response.json({ error: 'That is not yours to attach to.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const filename = String(body.filename || '').trim().slice(0, 200);
  const mimeType = String(body.mimeType || 'application/octet-stream').slice(0, 100);
  const base64 = String(body.data || '');

  if (!filename) return Response.json({ error: 'That file has no name.' }, { status: 400 });
  if (!base64) return Response.json({ error: 'No file data came through.' }, { status: 400 });

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return Response.json({ error: 'That file did not decode.' }, { status: 400 });
  }

  if (buffer.length === 0) return Response.json({ error: 'That file is empty.' }, { status: 400 });
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      { error: `That file is over the ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit.` },
      { status: 413 },
    );
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: id,
      filename,
      mimeType,
      size: buffer.length,
      data: buffer,
      uploadedById: user.id,
    },
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
  });

  return Response.json({ ok: true, attachment });
}
