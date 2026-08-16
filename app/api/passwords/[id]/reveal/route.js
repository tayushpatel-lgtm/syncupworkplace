import { prisma } from '../../../../../lib/db';
import { apiUser, isAdmin } from '../../../../../lib/auth';
import { decryptSecret } from '../../../../../lib/crypto';
import { canAccessPassword } from '../../../../../lib/passwords';

/**
 * The only route that ever returns a plaintext secret. POST rather than GET —
 * secrets never belong in a URL, browser history, or a GET response cache.
 */
export async function POST(request, { params }) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { id } = await params;
  const entry = await prisma.passwordEntry.findUnique({
    where: { id },
    include: { shares: { select: { userId: true } } },
  });
  if (!entry) return Response.json({ error: 'That entry is gone.' }, { status: 404 });

  if (!canAccessPassword(entry, user, isAdmin(user))) {
    return Response.json({ error: 'That has not been shared with you.' }, { status: 403 });
  }

  let secret;
  try {
    secret = decryptSecret(entry.secret);
  } catch {
    return Response.json(
      { error: 'Could not decrypt this — has SESSION_SECRET changed since it was saved?' },
      { status: 500 },
    );
  }

  return Response.json({ secret });
}
