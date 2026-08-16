import { prisma } from '../../../../lib/db';
import { apiUser, isAdmin } from '../../../../lib/auth';
import { encryptSecret } from '../../../../lib/crypto';
import { canManagePassword } from '../../../../lib/passwords';

const VISIBILITIES = ['COMPANY', 'DEPARTMENT', 'PEOPLE'];

export async function PATCH(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const entry = await prisma.passwordEntry.findUnique({ where: { id } });
  if (!entry) return Response.json({ error: 'That entry is gone.' }, { status: 404 });

  const admin = isAdmin(user);
  if (!canManagePassword(entry, user, admin)) {
    return Response.json({ error: 'Only the person who added it, or an admin, can change this.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const data = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return Response.json({ error: 'A title is required.' }, { status: 400 });
    data.title = title;
  }
  if (body.username !== undefined) data.username = String(body.username).trim() || null;
  if (body.url !== undefined) data.url = String(body.url).trim() || null;
  if (body.notes !== undefined) data.notes = String(body.notes).trim() || null;
  // Only rotates the secret when a new one is actually typed.
  if (body.secret) data.secret = encryptSecret(String(body.secret));

  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility)) {
      return Response.json({ error: 'Unknown visibility.' }, { status: 400 });
    }
    data.visibility = body.visibility;
    if (body.visibility === 'DEPARTMENT') {
      const department = String(body.department || '').trim();
      if (!department) return Response.json({ error: 'Pick a department.' }, { status: 400 });
      data.department = department;
    } else {
      data.department = null;
    }
  }

  await prisma.passwordEntry.update({ where: { id }, data });

  if (Array.isArray(body.shareWith)) {
    const shareWith = body.shareWith.filter(Boolean);
    await prisma.$transaction([
      prisma.passwordShare.deleteMany({ where: { passwordId: id } }),
      ...(shareWith.length
        ? [
            prisma.passwordShare.createMany({
              data: shareWith.map((userId) => ({ passwordId: id, userId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const entry = await prisma.passwordEntry.findUnique({ where: { id } });
  if (!entry) return Response.json({ error: 'That entry is gone.' }, { status: 404 });

  if (!canManagePassword(entry, user, isAdmin(user))) {
    return Response.json({ error: 'Only the person who added it, or an admin, can delete it.' }, { status: 403 });
  }

  await prisma.passwordEntry.delete({ where: { id } });
  return Response.json({ ok: true });
}
