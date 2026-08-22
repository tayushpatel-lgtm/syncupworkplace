import { apiUser } from '../../../../../lib/auth';
import { adminEditSession } from '../../../../../lib/day';
import { timeKey, zonedTimeToUtc, dateFieldKey } from '../../../../../lib/dates';
import { prisma } from '../../../../../lib/db';

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

export async function PATCH(request, { params }) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.workSession.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: 'No such session.' }, { status: 404 });

  const dateKey = dateFieldKey(existing.date);
  const startedAt =
    body.startedTime != null
      ? zonedTimeToUtc(dateKey, String(body.startedTime))
      : body.startedAt;
  const endedAt =
    body.endedTime === '' || body.endedTime === null
      ? null
      : body.endedTime != null
        ? zonedTimeToUtc(dateKey, String(body.endedTime))
        : body.endedAt;

  const result = await adminEditSession(user.id, id, {
    startedAt,
    endedAt,
    kind: body.kind,
    reason: body.reason,
  });
  if (result.error) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json({ ok: true, session: serialise(result.session) });
}
