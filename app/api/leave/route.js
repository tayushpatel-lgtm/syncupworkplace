import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { workingDaysBetween, canRequestCasual } from '../../../lib/leave';
import { dayKey } from '../../../lib/dates';

const KINDS = ['SICK', 'PLANNED'];
const KIND_LABEL = { SICK: 'sick', PLANNED: 'casual' };

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  if (user.employmentType === 'FREELANCER') {
    return Response.json(
      { error: 'Freelancer accounts have no leave policy beyond the weekly off.' },
      { status: 403 },
    );
  }

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
  if (kind === 'PLANNED' && !canRequestCasual(startDate)) {
    return Response.json(
      { error: 'Casual leave needs at least 2 days\' notice.' },
      { status: 400 },
    );
  }

  const days = await workingDaysBetween(startDate, endDate);
  if (days === 0) {
    return Response.json(
      { error: 'That range is all weekends and holidays — no leave needed.' },
      { status: 400 },
    );
  }

  const pool = kind === 'SICK' ? user.sickLeaveBalance : user.casualLeaveBalance;
  if (days > pool) {
    return Response.json(
      { error: `That is ${days} days and you have ${pool} left in ${KIND_LABEL[kind]} leave.` },
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

  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json({
    requests,
    balance: { casual: user.casualLeaveBalance, sick: user.sickLeaveBalance },
    today: dayKey(),
  });
}
