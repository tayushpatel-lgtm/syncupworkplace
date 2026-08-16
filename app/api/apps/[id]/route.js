import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

export async function DELETE(request, { params }) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await params;
  await prisma.app.deleteMany({ where: { id } });
  return Response.json({ ok: true });
}
