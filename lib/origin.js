import { headers } from 'next/headers';

/** This deployment's own externally-visible origin — needed for OAuth metadata URLs. */
export async function appOrigin() {
  const head = await headers();
  const host = head.get('x-forwarded-host') || head.get('host') || 'localhost:3000';
  const proto = head.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
