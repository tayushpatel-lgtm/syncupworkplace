import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { adminMergeSessions } from '../../../../lib/day';
import { dayKey, dayDate, timeKey } from '../../../../lib/dates';

function serialise(session) {
  return {
    id: session.id,
    userId: session.userId,
    kind: session.kind,
    date: session.date.toISOString().slice(0, 10),
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    startedTime: timeKey(session.startedAt),
    endedTime: session.endedAt ? timeKey(session.endedAt) : '',
    open: !session.endedAt,
  };
}

export async function GET(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const date = url.searchParams.get('date') || dayKey();

  if (!userId) return Response.json({ error: 'A person is required.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Not a valid day.' }, { status: 400 });
  }

  const sessions = await prisma.workSession.findMany({
    where: { userId, date: dayDate(date) },
    orderBy: { startedAt: 'asc' },
  });

  return Response.json({ sessions: sessions.map(serialise) });
}

export async function POST(request) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const result = await adminMergeSessions(user.id, body.keepId, body.absorbId, body.reason);
  if (result.error) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json({ ok: true, session: serialise(result.session) });
}
