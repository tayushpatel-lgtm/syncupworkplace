import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';

export async function POST(request) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return Response.json({ error: 'The app needs a name.' }, { status: 400 });

  const last = await prisma.app.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });

  const app = await prisma.app.create({
    data: {
      name,
      description: String(body.description || '').trim() || null,
      url: String(body.url || '').trim() || null,
      icon: String(body.icon || '').trim().slice(0, 4) || '◆',
      department: String(body.department || '').trim() || null,
      order: (last?.order || 0) + 1,
      createdById: user.id,
    },
  });

  return Response.json({ ok: true, id: app.id });
}
