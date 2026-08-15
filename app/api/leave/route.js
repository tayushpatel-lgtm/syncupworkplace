import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { workingDaysBetween, ensureBalance, remaining, currentYear } from '../../../lib/leave';

const KINDS = ['SICK', 'PLANNED'];

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const kind = KINDS.includes(body.kind) ? body.kind : 'PLANNED';
  const startDate = String(body.startDate || '');
  const endDate = String(body.endDate || '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return Response.json({ error: 'Both dates are required.' }, { status: 400 });
  }
  if (endDate < startDate) {
    return Response.json({ error: 'The end date comes before the start date.' }, { status: 400 });
  }

  const days = await workingDaysBetween(startDate, endDate);
  if (days === 0) {
    return Response.json(
      { error: 'That range is all weekends and holidays — no leave needed.' },
      { status: 400 },
    );
  }

  const year = Number(startDate.slice(0, 4));
  const balance = await ensureBalance(user.id, year);
  const left = remaining(balance);
  const pool = kind === 'SICK' ? left.sick : left.planned;

  if (days > pool) {
    return Response.json(
      { error: `That is ${days} days and you have ${pool} left in ${kind.toLowerCase()} leave.` },
      { status: 409 },
    );
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: new Date(`${endDate}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${startDate}T00:00:00.000Z`) },
    },
  });
  if (overlap) {
    return Response.json({ error: 'You already have leave filed across those dates.' }, { status: 409 });
  }

  await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      kind,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      endDate: new Date(`${endDate}T00:00:00.000Z`),
      days,
      reason: String(body.reason || '').trim() || null,
    },
  });

  return Response.json({ ok: true, days });
}

export async function GET() {
  const { user, error } = await apiUser();
  if (error) return error;

  const [requests, balance] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    ensureBalance(user.id, currentYear()),
  ]);

  return Response.json({ requests, balance, remaining: remaining(balance) });
}
