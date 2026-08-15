import { apiUser } from '../../../../lib/auth';
import { switchSession, reconcileSessions } from '../../../../lib/day';
import { dayKey } from '../../../../lib/dates';

const ALLOWED = ['WORK', 'BREAK', 'STOP'];

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { kind } = await request.json().catch(() => ({}));
  if (!ALLOWED.includes(kind)) {
    return Response.json({ error: 'kind must be WORK, BREAK or STOP.' }, { status: 400 });
  }

  await reconcileSessions(user.id);
  await switchSession(user, kind, dayKey());
  return Response.json({ ok: true });
}
