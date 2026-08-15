import { apiUser } from '../../../../lib/auth';
import { heartbeat } from '../../../../lib/day';

export async function POST() {
  const { user, error } = await apiUser();
  if (error) return error;

  await heartbeat(user.id);
  return Response.json({ ok: true });
}
