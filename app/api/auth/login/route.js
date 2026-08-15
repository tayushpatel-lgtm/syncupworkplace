import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/db';
import { signSession, sessionCookie } from '../../../../lib/session';

export async function POST(request) {
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password) {
    return Response.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  // One message for both a missing account and a wrong password, so the form
  // can't be used to find out who works here.
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    return Response.json({ error: 'That email and password do not match.' }, { status: 401 });
  }

  const token = await signSession({ sub: user.id, role: user.role });
  const jar = await cookies();
  jar.set(sessionCookie.name, token, sessionCookie.options);

  return Response.json({ ok: true, role: user.role });
}
