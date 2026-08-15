import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { date, name } = await request.json().catch(() => ({}));
  if (!date || !String(name || '').trim()) {
    return Response.json({ error: 'A holiday needs a date and a name.' }, { status: 400 });
  }

  const day = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    return Response.json({ error: 'That date does not parse.' }, { status: 400 });
  }

  await prisma.holiday.upsert({
    where: { date: day },
    create: { date: day, name: String(name).trim() },
    update: { name: String(name).trim() },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });

  await prisma.holiday.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
