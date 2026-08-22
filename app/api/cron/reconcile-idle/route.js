import { currentUser, isAdmin } from '../../../../lib/auth';
import { reconcileAllStaleSessions } from '../../../../lib/day';
import { safeEqual } from '../../../../lib/tokens';

/**
 * Close every abandoned open session in the company whose heartbeat is past
 * its own idle cut-off (or left over from a previous company-local day).
 * Reachable two ways — a scheduled call carrying CRON_SECRET, or an admin
 * pressing the button on the Settings page.
 */
async function runPass() {
  return reconcileAllStaleSessions();
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not set on this deployment.' }, { status: 503 });
  }

  const offered = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!offered || !safeEqual(offered, secret)) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  return Response.json(await runPass());
}

export async function POST() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json(await runPass());
}
