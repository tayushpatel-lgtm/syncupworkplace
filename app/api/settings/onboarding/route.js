import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { title, description, kind } = await request.json().catch(() => ({}));
  const text = String(title || '').trim();
  if (!text) return Response.json({ error: 'A step needs a title.' }, { status: 400 });
  const stepKind = kind === 'SLACK_ID' ? 'SLACK_ID' : 'CHECK';

  const last = await prisma.onboardingStep.findFirst({
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  await prisma.onboardingStep.create({
    data: {
      title: text,
      description: String(description || '').trim() || null,
      order: (last?.order || 0) + 1,
      kind: stepKind,
    },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });

  // Progress rows cascade with the step, so removing it un-blocks anyone stuck on it.
  await prisma.onboardingStep.deleteMany({ where: { id: String(id) } });
  return Response.json({ ok: true });
}
