import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { stepId, done } = await request.json().catch(() => ({}));
  if (!stepId) return Response.json({ error: 'stepId is required.' }, { status: 400 });

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
