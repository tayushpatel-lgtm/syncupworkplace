import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { encryptSecret } from '../../../lib/crypto';

const VISIBILITIES = ['COMPANY', 'DEPARTMENT', 'PEOPLE'];

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const secretPlain = String(body.secret || '');
  const visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : 'PEOPLE';

  if (!title) return Response.json({ error: 'Give it a title.' }, { status: 400 });
  if (!secretPlain) return Response.json({ error: 'The password itself is required.' }, { status: 400 });

  let department = null;
  if (visibility === 'DEPARTMENT') {
    department = String(body.department || '').trim();
    if (!department) {
      return Response.json({ error: 'Pick which department this is for.' }, { status: 400 });
    }
  }

  const entry = await prisma.passwordEntry.create({
    data: {
      title,
      username: String(body.username || '').trim() || null,
      secret: encryptSecret(secretPlain),
      url: String(body.url || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      visibility,
      department,
      createdById: user.id,
    },
  });

  const shareWith = Array.isArray(body.shareWith) ? body.shareWith.filter(Boolean) : [];
  if (shareWith.length) {
    await prisma.passwordShare.createMany({
      data: shareWith.map((userId) => ({ passwordId: entry.id, userId })),
      skipDuplicates: true,
    });
  }

  return Response.json({ ok: true, id: entry.id });
}
