import { currentUser, isAdmin } from '../../../../lib/auth';
import { runCheckInNudge } from '../../../../lib/check-in-nudge';
import { safeEqual } from '../../../../lib/tokens';

/**
 * 15 minutes before each person's own check-in time, DM them to open Syncup.
 * 09:30 people fire at 09:15; 10:00 people fire at 09:45. Scheduled every
 * five minutes between 08:30 and 10:30 company time (03:00–05:55 UTC for
 * Asia/Kolkata); the handler no-ops outside that window.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not set on this deployment.' }, { status: 503 });
  }

  const offered = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!offered || !safeEqual(offered, secret)) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  return Response.json(await runCheckInNudge());
}

export async function POST() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json(await runCheckInNudge());
}
