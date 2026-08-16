import { currentUser, isAdmin } from '../../../../lib/auth';
import { syncAllToSheets } from '../../../../lib/google-sheets';
import { safeEqual } from '../../../../lib/tokens';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not set on this deployment.' }, { status: 503 });
  }

  const offered = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!offered || !safeEqual(offered, secret)) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  return Response.json(await syncAllToSheets());
}

export async function POST() {
  // The manual path: an admin, signed in, pressing "sync now".
  const user = await currentUser();
  if (!user || !isAdmin(user)) {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json(await syncAllToSheets());
}
