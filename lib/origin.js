import { headers } from 'next/headers';

/** Public app URL for server-side links (Slack DMs, etc.) when request headers are unavailable. */
export function publicAppUrl() {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** This deployment's own externally-visible origin — needed for OAuth metadata URLs. */
export async function appOrigin() {
  const head = await headers();
  const host = head.get('x-forwarded-host') || head.get('host') || 'localhost:3000';
  const proto = head.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
