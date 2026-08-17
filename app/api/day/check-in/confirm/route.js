import { apiUser } from '../../../../../lib/auth';
import { getAttendance, getPlan, confirmCheckIn } from '../../../../../lib/day';
import { dayKey } from '../../../../../lib/dates';

/**
 * The last step of checking in: the person has ticked/added their plan in the
 * popup, and this both requires at least one point and fires the Slack
 * notification carrying that finalized plan.
 */
export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;

  const key = dayKey();
  const attendance = await getAttendance(user.id, key);
  if (!attendance?.checkInAt) {
    return Response.json({ error: 'Check in first.' }, { status: 400 });
  }

  const plan = await getPlan(user.id, key);
  if (plan.length === 0) {
    return Response.json({ error: 'Add at least one point before starting the day.' }, { status: 400 });
  }

  await confirmCheckIn(user, key);
  return Response.json({ ok: true });
}
