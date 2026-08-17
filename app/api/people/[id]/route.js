import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';

const ROLES = ['EMPLOYEE', 'ADMIN', 'CEO'];
const EMPLOYMENT_TYPES = ['FULL_TIME', 'INTERN', 'FREELANCER'];

export async function PATCH(request, { params }) {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ error: 'No such person.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: 'A name is required.' }, { status: 400 });
    data.name = name;
  }
  if (body.department !== undefined) data.department = String(body.department).trim() || null;
  if (body.employmentType !== undefined) {
    if (!EMPLOYMENT_TYPES.includes(body.employmentType)) {
      return Response.json({ error: 'Unknown employment type.' }, { status: 400 });
    }
    data.employmentType = body.employmentType;
  }
  if (body.title !== undefined) data.title = String(body.title).trim() || null;
  if (body.checkInBy !== undefined) {
    data.checkInBy = /^\d{2}:\d{2}$/.test(body.checkInBy) ? body.checkInBy : null;
  }
  if (body.minPresentMinutes !== undefined) {
    const mins = Number(body.minPresentMinutes);
    if (mins === null || body.minPresentMinutes === null) {
      data.minPresentMinutes = null;
    } else if (!Number.isInteger(mins) || mins < 30 || mins > 720) {
      return Response.json({ error: 'Minimum hours must be 30 to 720 minutes.' }, { status: 400 });
    } else {
      data.minPresentMinutes = mins;
    }
  }

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return Response.json({ error: 'Unknown role.' }, { status: 400 });
    if (id === user.id) {
      return Response.json({ error: 'You cannot change your own role.' }, { status: 400 });
    }
    if ((body.role === 'CEO' || target.role === 'CEO') && user.role !== 'CEO') {
      return Response.json({ error: 'Only the CEO can move that role.' }, { status: 403 });
    }
    data.role = body.role;
  }

  if (body.active !== undefined) {
    if (id === user.id) {
      return Response.json({ error: 'You cannot deactivate yourself.' }, { status: 400 });
    }
    if (target.role === 'CEO' && user.role !== 'CEO') {
      return Response.json({ error: 'Only the CEO can do that.' }, { status: 403 });
    }
    data.active = !!body.active;
  }

  if (body.password !== undefined) {
    if (target.role === 'CEO' && user.role !== 'CEO') {
      return Response.json({ error: 'Only the CEO can reset that password.' }, { status: 403 });
    }
    const password = String(body.password);
    if (password.length < 8) {
      return Response.json({ error: 'A password needs at least 8 characters.' }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
    // A password they didn't pick themselves — same rule as a first login.
    data.mustChangePassword = true;
  }

  await prisma.user.update({ where: { id }, data });
  return Response.json({ ok: true });
}
