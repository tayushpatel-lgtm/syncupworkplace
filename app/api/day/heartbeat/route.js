import { apiUser } from '../../../../lib/auth';
import { heartbeat } from '../../../../lib/day';

export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;

  const result = await heartbeat(user.id);
  return Response.json({ ok: true, running: result.running, reconciled: result.reconciled });
}
