import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { ensureBalance, currentYear } from '../../../../lib/leave';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const sickTotal = Number(body.sickTotal);
  const plannedTotal = Number(body.plannedTotal);
  const year = Number(body.year) || currentYear();

  if (![sickTotal, plannedTotal].every((n) => Number.isInteger(n) && n >= 0 && n <= 365)) {
    return Response.json({ error: 'Allowances must be whole days between 0 and 365.' }, { status: 400 });
  }

  const people = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  // Everyone gets a row first, so nobody is skipped by never having looked at leave.
  for (const person of people) await ensureBalance(person.id, year);

  await prisma.leaveBalance.updateMany({
    where: { year, userId: { in: people.map((p) => p.id) } },
    data: { sickTotal, plannedTotal },
  });

  return Response.json({ ok: true, applied: people.length });
}
