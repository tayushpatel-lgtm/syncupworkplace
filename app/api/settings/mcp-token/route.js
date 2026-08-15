import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { mintToken } from '../../../../lib/tokens';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { name } = await request.json().catch(() => ({}));
  const label = String(name || '').trim();
  if (!label) return Response.json({ error: 'Give the token a name.' }, { status: 400 });

  const { token, hash, prefix } = mintToken();
  await prisma.mcpToken.create({ data: { name: label, tokenHash: hash, prefix } });

  // The only time the plaintext ever leaves this process.
  return Response.json({ ok: true, token });
}

export async function DELETE(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });

  await prisma.mcpToken.updateMany({
    where: { id: String(id) },
    data: { revokedAt: new Date() },
  });
  return Response.json({ ok: true });
}
