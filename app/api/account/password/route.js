import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { password } = await request.json().catch(() => ({}));
  if (String(password || '').length < 8) {
    return Response.json({ error: 'The password needs at least 8 characters.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(String(password), 10), mustChangePassword: false },
  });

  return Response.json({ ok: true });
}
