import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { SLACK_ID_PATTERN } from '../../../lib/slack';

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { stepId, done, value } = await request.json().catch(() => ({}));
  if (!stepId) return Response.json({ error: 'stepId is required.' }, { status: 400 });

  const step = await prisma.onboardingStep.findUnique({ where: { id: String(stepId) } });
  if (!step) return Response.json({ error: 'That step is gone.' }, { status: 404 });

  if (step.kind === 'SLACK_ID') {
    if (done) {
      const slackId = String(value || '').trim().toUpperCase();
      if (!SLACK_ID_PATTERN.test(slackId)) {
        return Response.json(
          { error: 'That doesn\'t look like a Slack member ID — it reads like "U0123ABCDE", from your Slack profile → More → Copy member ID.' },
          { status: 400 },
        );
      }
      await prisma.user.update({ where: { id: user.id }, data: { slackUserId: slackId } });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { slackUserId: null } });
    }
  }

  if (done) {
    await prisma.onboardingProgress.upsert({
      where: { userId_stepId: { userId: user.id, stepId } },
      create: { userId: user.id, stepId },
      update: {},
    });
  } else {
    await prisma.onboardingProgress.deleteMany({ where: { userId: user.id, stepId } });
  }

  return Response.json({ ok: true });
}
