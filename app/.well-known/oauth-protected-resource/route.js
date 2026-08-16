import { appOrigin } from '../../../lib/origin';

export const dynamic = 'force-dynamic';

/** RFC 9728 — what a 401 from /api/mcp points a client at to find the authorization server. */
export async function GET() {
  const origin = await appOrigin();
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
}
