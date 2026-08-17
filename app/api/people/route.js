import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { accrueIfDue } from '../../../lib/leave';

const ROLES = ['EMPLOYEE', 'ADMIN', 'CEO'];
const EMPLOYMENT_TYPES = ['FULL_TIME', 'INTERN', 'FREELANCER'];

export async function POST(request) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const email = String(body.email || '').toLowerCase().trim();
  const role = ROLES.includes(body.role) ? body.role : 'EMPLOYEE';
  const employmentType = EMPLOYMENT_TYPES.includes(body.employmentType) ? body.employmentType : 'FULL_TIME';

  if (!name || !email) return Response.json({ error: 'Name and email are required.' }, { status: 400 });
  // Only the CEO hands out the CEO role.
  if (role === 'CEO' && user.role !== 'CEO') {
    return Response.json({ error: 'Only the CEO can grant that role.' }, { status: 403 });
  }

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) return Response.json({ error: 'That email is already on the books.' }, { status: 409 });

  // Everyone starts with their email as their password and has to pick their
  // own on first login — nobody hands out a password someone else chose.
  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(email, 10),
      mustChangePassword: true,
      role,
      employmentType,
      department: String(body.department || '').trim() || null,
      title: String(body.title || '').trim() || null,
      checkInBy: /^\d{2}:\d{2}$/.test(body.checkInBy || '') ? body.checkInBy : null,
    },
  });

  await accrueIfDue(created);
  return Response.json({ ok: true, id: created.id });
}
