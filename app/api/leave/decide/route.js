import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

const DECISIONS = ['APPROVED', 'REJECTED'];

export async function POST(request) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const { id, decision, note } = await request.json().catch(() => ({}));
  if (!DECISIONS.includes(decision)) {
    return Response.json({ error: 'The decision must be APPROVED or REJECTED.' }, { status: 400 });
  }

  const leave = await prisma.leaveRequest.findUnique({ where: { id: String(id || '') } });
  if (!leave) return Response.json({ error: 'No such request.' }, { status: 404 });
  if (leave.status !== 'PENDING') {
    return Response.json({ error: 'That request has already been settled.' }, { status: 409 });
  }

  await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: decision,
      decidedById: user.id,
      decidedAt: new Date(),
      note: String(note || '').trim() || null,
    },
  });

  // Only an approval spends the balance.
  if (decision === 'APPROVED') {
    const field = leave.kind === 'SICK' ? 'sickLeaveBalance' : 'casualLeaveBalance';
    const person = await prisma.user.findUnique({ where: { id: leave.userId }, select: { [field]: true } });
    if (person) {
      await prisma.user.update({
        where: { id: leave.userId },
        data: { [field]: Math.max(0, person[field] - leave.days) },
      });
    }
  }

  return Response.json({ ok: true });
}
