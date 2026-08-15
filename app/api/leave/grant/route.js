import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { ensureBalance, currentYear } from '../../../../lib/leave';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const days = Number(body.days);
  const kind = body.kind === 'SICK' ? 'SICK' : 'PLANNED';
  const year = Number(body.year) || currentYear();

  if (!body.userId) return Response.json({ error: 'Pick a person.' }, { status: 400 });
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    return Response.json({ error: 'Grant between 1 and 60 days.' }, { status: 400 });
  }

  const balance = await ensureBalance(String(body.userId), year);
  const field = kind === 'SICK' ? 'sickTotal' : 'plannedTotal';

  await prisma.leaveBalance.update({
    where: { id: balance.id },
    data: { [field]: balance[field] + days },
  });

  return Response.json({ ok: true });
}
