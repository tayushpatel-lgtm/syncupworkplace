import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const days = Number(body.days);
  const kind = body.kind === 'SICK' ? 'SICK' : 'PLANNED';
  const field = kind === 'SICK' ? 'sickLeaveBalance' : 'casualLeaveBalance';

  if (!body.userId) return Response.json({ error: 'Pick a person.' }, { status: 400 });
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    return Response.json({ error: 'Grant between 1 and 60 days.' }, { status: 400 });
  }

  const person = await prisma.user.findUnique({ where: { id: String(body.userId) }, select: { [field]: true } });
  if (!person) return Response.json({ error: 'No such person.' }, { status: 404 });

  // A manual grant is an explicit override — it can push casual leave past
  // the usual 6-day cap, unlike the automatic monthly accrual.
  await prisma.user.update({
    where: { id: String(body.userId) },
    data: { [field]: person[field] + days },
  });

  return Response.json({ ok: true });
}
