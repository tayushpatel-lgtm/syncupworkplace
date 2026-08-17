import { apiUser } from '../../../../lib/auth';
import { checkIn, getPlan } from '../../../../lib/day';
import { dayKey } from '../../../../lib/dates';

export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;

  const key = dayKey();
  const attendance = await checkIn(user, key);
  const plan = await getPlan(user.id, key);

  return Response.json({
    ok: true,
    late: attendance.late,
    plan: plan.map((p) => ({ id: p.id, title: p.title })),
  });
}
