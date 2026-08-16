import { prisma } from '../../../lib/db';

function looksLikeUri(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * RFC 7591 Dynamic Client Registration — lets Claude (or any MCP client)
 * register itself without a pre-shared client id. Public clients only: no
 * secret is issued, since PKCE at the token exchange takes its place and a
 * secret would have nowhere safe to live in a browser-based client anyway.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];

  if (redirectUris.length === 0 || !redirectUris.every(looksLikeUri)) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of https:// URLs.' },
      { status: 400 },
    );
  }

  const client = await prisma.oAuthClient.create({
    data: {
      name: body.client_name ? String(body.client_name).slice(0, 200) : null,
      redirectUris,
    },
  });

  return Response.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201 },
  );
}
