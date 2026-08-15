import { cookies } from 'next/headers';
import { sessionCookie } from '../../../../lib/session';

export async function POST() {
  const jar = await cookies();
  jar.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 });
  return Response.json({ ok: true });
}
