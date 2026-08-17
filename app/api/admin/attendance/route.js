import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { adminSetAttendance } from '../../../../lib/day';
import { dayKey } from '../../../../lib/dates';

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { userId, date } = body;

  if (!userId || typeof userId !== 'string') {
    return Response.json({ error: 'A person is required.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > dayKey()) {
    return Response.json({ error: 'Not a valid day.' }, { status: 400 });
  }

  const checkInTime = body.checkInTime ? String(body.checkInTime) : null;
  const checkOutTime = body.checkOutTime ? String(body.checkOutTime) : null;
  if (checkInTime && !TIME_PATTERN.test(checkInTime)) {
    return Response.json({ error: 'Not a valid check-in time.' }, { status: 400 });
  }
  if (checkOutTime && !TIME_PATTERN.test(checkOutTime)) {
    return Response.json({ error: 'Not a valid check-out time.' }, { status: 400 });
  }
  if (checkOutTime && !checkInTime) {
    return Response.json({ error: 'A check-out time needs a check-in time too.' }, { status: 400 });
  }

  const person = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, checkInBy: true } });
  if (!person) return Response.json({ error: 'No such person.' }, { status: 404 });

  const { attendance, sessionCreated } = await adminSetAttendance(person, date, { checkInTime, checkOutTime });

  return Response.json({
    ok: true,
    attendance: { checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, late: attendance.late, status: attendance.status },
    sessionCreated,
  });
}
