import { apiUser } from '../../../../lib/auth';
import { checkIn } from '../../../../lib/day';
import { dayKey } from '../../../../lib/dates';

export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;

  const attendance = await checkIn(user, dayKey());
  return Response.json({ ok: true, late: attendance.late });
}
