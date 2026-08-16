import { appOrigin } from '../../../lib/origin';

export const dynamic = 'force-dynamic';

/** RFC 8414 — how an MCP client (e.g. Claude's Connectors screen) discovers our OAuth endpoints. */
export async function GET() {
  const origin = await appOrigin();
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}
