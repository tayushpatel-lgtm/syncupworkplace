import { prisma } from '../../../lib/db';
import { verifyPkce } from '../../../lib/oauth';
import { mintToken } from '../../../lib/tokens';

function oauthError(error, description, status = 400) {
  return Response.json({ error, error_description: description }, { status });
}

/**
 * RFC 6749 §4.1.3 (authorization_code grant) + RFC 7636 (PKCE). Exchanges a
 * one-time code from /oauth/authorize for a real access token — the same
 * McpToken rows the Settings page mints by hand, so revoking one revokes the
 * other identically.
 */
export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  const params = contentType.includes('application/json')
    ? await request.json().catch(() => ({}))
    : Object.fromEntries((await request.formData().catch(() => new FormData())).entries());

  const grantType = params.grant_type;
  const code = String(params.code || '');
  const redirectUri = String(params.redirect_uri || '');
  const clientId = String(params.client_id || '');
  const codeVerifier = String(params.code_verifier || '');

  if (grantType !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Only authorization_code is supported.');
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return oauthError('invalid_request', 'code, redirect_uri, client_id and code_verifier are all required.');
  }

  const row = await prisma.oAuthCode.findUnique({ where: { code } });
  if (
    !row ||
    row.usedAt ||
    row.expiresAt < new Date() ||
    row.clientId !== clientId ||
    row.redirectUri !== redirectUri ||
    !verifyPkce(codeVerifier, row.codeChallenge)
  ) {
    return oauthError('invalid_grant', 'That code is invalid, expired, already used, or the verifier does not match.');
  }

  // Atomically claim the code — a concurrent second exchange loses the race
  // and gets invalid_grant, same as a genuine replay would.
  const claimed = await prisma.oAuthCode.updateMany({
    where: { code, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return oauthError('invalid_grant', 'That code has already been used.');
  }

  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  const { token, hash, prefix } = mintToken();
  await prisma.mcpToken.create({
    data: {
      name: client?.name ? `${client.name} (OAuth)` : 'OAuth client',
      tokenHash: hash,
      prefix,
      scope: row.scope,
      createdById: row.userId,
      oauthClientId: clientId,
    },
  });

  return Response.json({
    access_token: token,
    token_type: 'Bearer',
    scope: row.scope === 'READ_WRITE' ? 'read_write' : 'read',
  });
}
