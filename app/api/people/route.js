import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { ensureBalance, currentYear } from '../../../lib/leave';

const ROLES = ['EMPLOYEE', 'ADMIN', 'CEO'];

export async function POST(request) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');
  const role = ROLES.includes(body.role) ? body.role : 'EMPLOYEE';

  if (!name || !email) return Response.json({ error: 'Name and email are required.' }, { status: 400 });
  if (password.length < 8) {
    return Response.json({ error: 'The first password needs at least 8 characters.' }, { status: 400 });
  }
  // Only the CEO hands out the CEO role.
  if (role === 'CEO' && user.role !== 'CEO') {
    return Response.json({ error: 'Only the CEO can grant that role.' }, { status: 403 });
  }

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) return Response.json({ error: 'That email is already on the books.' }, { status: 409 });

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      department: String(body.department || '').trim() || null,
      title: String(body.title || '').trim() || null,
      checkInBy: /^\d{2}:\d{2}$/.test(body.checkInBy || '') ? body.checkInBy : null,
    },
  });

  await ensureBalance(created.id, currentYear());
  return Response.json({ ok: true, id: created.id });
}
