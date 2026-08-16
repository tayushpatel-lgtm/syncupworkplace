import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { SETTINGS_ID, getSettings } from '../../../lib/settings';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { name } = await request.json().catch(() => ({}));
  const department = String(name || '').trim();
  if (!department) return Response.json({ error: 'Give the department a name.' }, { status: 400 });

  const settings = await getSettings();
  if (settings.departments.some((d) => d.toLowerCase() === department.toLowerCase())) {
    return Response.json({ error: 'That department already exists.' }, { status: 409 });
  }

  await prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: { departments: [...settings.departments, department] },
  });

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { name } = await request.json().catch(() => ({}));
  const settings = await getSettings();

  await prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: { departments: settings.departments.filter((d) => d !== name) },
  });

  return Response.json({ ok: true });
}
