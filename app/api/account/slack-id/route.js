import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { SLACK_ID_PATTERN } from '../../../../lib/slack';

/**
 * Lets anyone set their own Slack member ID, not just people going through the
 * onboarding checklist's Slack ID step — that step only ever shows once, so an
 * account that existed before it was added (or just skipped it) had no way in.
 */
export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { value } = await request.json().catch(() => ({}));
  const raw = String(value || '').trim();

  if (!raw) {
    await prisma.user.update({ where: { id: user.id }, data: { slackUserId: null } });
    return Response.json({ ok: true, slackUserId: null });
  }

  const slackId = raw.toUpperCase();
  if (!SLACK_ID_PATTERN.test(slackId)) {
    return Response.json(
      { error: 'That doesn\'t look like a Slack member ID — it reads like "U0123ABCDE", from your Slack profile → More → Copy member ID.' },
      { status: 400 },
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { slackUserId: slackId } });
  return Response.json({ ok: true, slackUserId: slackId });
}
