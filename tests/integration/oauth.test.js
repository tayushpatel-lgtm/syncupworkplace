import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { BASE_URL } from './config.js';
import { api, page, loginAsCeo, testDb } from './helpers.js';

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function registerClient(redirectUri = 'https://example.com/callback') {
  const res = await api('/oauth/register', {
    method: 'POST',
    body: { client_name: 'Test Client', redirect_uris: [redirectUri] },
  });
  return { ...res.json, redirectUri };
}

/** A plain form POST, redirects left uninterpreted so the Location header is inspectable. */
async function formPost(path, fields, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
  return { status: res.status, location: res.headers.get('location') };
}

/** Runs the whole authorize -> decision(allow) -> token exchange, returns the access token. */
async function fullGrant(ceoCookie, scope = 'READ_ONLY') {
  const client = await registerClient();
  const { verifier, challenge } = pkcePair();
  const state = 'state-' + Math.random().toString(36).slice(2);

  const decision = await formPost(
    '/oauth/authorize/decision',
    { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state, decision: 'allow', scope },
    ceoCookie,
  );
  const code = new URL(decision.location).searchParams.get('code');

  const tokenRes = await api('/oauth/token', {
    method: 'POST',
    body: { grant_type: 'authorization_code', code, redirect_uri: client.redirectUri, client_id: client.client_id, code_verifier: verifier },
  });
  return { client, code, verifier, state, tokenRes };
}

async function mcpCall(token, method, params) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

describe('OAuth metadata', () => {
  it('serves authorization server metadata with the endpoints a client needs', async () => {
    const res = await api('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.json.authorization_endpoint).toContain('/oauth/authorize');
    expect(res.json.token_endpoint).toContain('/oauth/token');
    expect(res.json.registration_endpoint).toContain('/oauth/register');
    expect(res.json.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('serves protected resource metadata pointing at itself as the authorization server', async () => {
    const res = await api('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.json.resource).toContain('/api/mcp');
    expect(res.json.authorization_servers).toHaveLength(1);
  });

  it('a 401 from /api/mcp advertises the protected-resource metadata URL', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
  });
});

describe('Dynamic Client Registration', () => {
  it('registers a client and returns a usable client_id', async () => {
    const client = await registerClient();
    expect(client.client_id).toBeTruthy();
    expect(client.token_endpoint_auth_method).toBe('none');

    const row = await testDb.oAuthClient.findUnique({ where: { id: client.client_id } });
    expect(row.redirectUris).toEqual(['https://example.com/callback']);
  });

  it('rejects registration with no redirect_uris', async () => {
    const res = await api('/oauth/register', { method: 'POST', body: { client_name: 'Bad' } });
    expect(res.status).toBe(400);
  });

  it('rejects a non-https redirect_uri', async () => {
    const res = await api('/oauth/register', {
      method: 'POST',
      body: { redirect_uris: ['http://not-localhost.example.com/callback'] },
    });
    expect(res.status).toBe(400);
  });
});

describe('the authorize screen', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('sends a signed-out visitor to login, preserving the whole request as next', async () => {
    const client = await registerClient();
    const { challenge } = pkcePair();
    const url = `/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(client.redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256&state=abc`;
    const res = await page(url);
    expect(res.status).toBe(307);

    const loginUrl = new URL(res.location, 'http://x');
    expect(loginUrl.pathname).toBe('/login');
    const next = new URL(loginUrl.searchParams.get('next'), 'http://x');
    expect(next.pathname).toBe('/oauth/authorize');
    expect(next.searchParams.get('response_type')).toBe('code');
    expect(next.searchParams.get('client_id')).toBe(client.client_id);
    expect(next.searchParams.get('redirect_uri')).toBe(client.redirectUri);
    expect(next.searchParams.get('code_challenge')).toBe(challenge);
    expect(next.searchParams.get('code_challenge_method')).toBe('S256');
    expect(next.searchParams.get('state')).toBe('abc');
  });

  it('shows a consent screen to a signed-in user for a known client', async () => {
    const client = await registerClient();
    const { challenge } = pkcePair();
    const url = `/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(client.redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256&state=abc`;
    const res = await page(url, { cookie: ceoCookie });
    expect(res.status).toBe(200);
    expect(res.text).toContain('wants to connect to Syncup');
  });

  it('refuses an unregistered client', async () => {
    const res = await page('/oauth/authorize?response_type=code&client_id=not-real&redirect_uri=https://x.com&code_challenge=abc', {
      cookie: ceoCookie,
    });
    expect(res.text).toContain('Unknown application');
  });

  it("refuses a redirect_uri the client didn't register", async () => {
    const client = await registerClient();
    const res = await page(
      `/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent('https://evil.example.com')}&code_challenge=abc`,
      { cookie: ceoCookie },
    );
    expect(res.text).toContain('Unknown application');
  });

  it('refuses a PKCE method other than S256', async () => {
    const client = await registerClient();
    const res = await page(
      `/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(client.redirectUri)}&code_challenge=abc&code_challenge_method=plain`,
      { cookie: ceoCookie },
    );
    expect(res.text).toContain('Unsupported PKCE method');
  });
});

describe('the decision + token exchange', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('a denied consent redirects back with error=access_denied and no code', async () => {
    const client = await registerClient();
    const { challenge } = pkcePair();
    const decision = await formPost(
      '/oauth/authorize/decision',
      { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state: 's1', decision: 'deny' },
      ceoCookie,
    );
    const back = new URL(decision.location);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('code')).toBeNull();
  });

  it('an allowed consent redirects back with a code and the original state', async () => {
    const client = await registerClient();
    const { challenge } = pkcePair();
    const decision = await formPost(
      '/oauth/authorize/decision',
      { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state: 'keep-me', decision: 'allow' },
      ceoCookie,
    );
    const back = new URL(decision.location);
    expect(back.searchParams.get('state')).toBe('keep-me');
    expect(back.searchParams.get('code')).toBeTruthy();
  });

  it('exchanges a valid code + verifier for a working, read-only-by-default access token', async () => {
    const { tokenRes } = await fullGrant(ceoCookie, 'READ_ONLY');
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.json.access_token).toBeTruthy();
    expect(tokenRes.json.token_type).toBe('Bearer');
    expect(tokenRes.json.scope).toBe('read');

    const list = await mcpCall(tokenRes.json.access_token, 'tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    expect(names).toContain('who_is_in');
    expect(names).not.toContain('assign_task');
  });

  it('a read-write grant issues a token that can call the write tools, attributed to the approving user', async () => {
    const { tokenRes } = await fullGrant(ceoCookie, 'READ_WRITE');
    expect(tokenRes.json.scope).toBe('read_write');

    const list = await mcpCall(tokenRes.json.access_token, 'tools/list', {});
    expect(list.result.tools.map((t) => t.name)).toContain('assign_task');

    const row = await testDb.mcpToken.findFirst({ where: { name: { contains: '(OAuth)' } }, orderBy: { createdAt: 'desc' } });
    expect(row.oauthClientId).toBeTruthy();
    expect(row.scope).toBe('READ_WRITE');

    const ceo = await testDb.user.findFirst({ where: { email: 'ceo@fixture.test' } });
    expect(row.createdById).toBe(ceo.id);
  });

  it('rejects a token exchange with the wrong code_verifier', async () => {
    const client = await registerClient();
    const { challenge } = pkcePair();
    const decision = await formPost(
      '/oauth/authorize/decision',
      { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state: 's', decision: 'allow' },
      ceoCookie,
    );
    const code = new URL(decision.location).searchParams.get('code');

    const res = await api('/oauth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', code, redirect_uri: client.redirectUri, client_id: client.client_id, code_verifier: 'totally-wrong-verifier' },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('invalid_grant');
  });

  it('rejects reusing an already-exchanged code', async () => {
    const { client, code, verifier } = await fullGrant(ceoCookie);
    const replay = await api('/oauth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', code, redirect_uri: client.redirectUri, client_id: client.client_id, code_verifier: verifier },
    });
    expect(replay.status).toBe(400);
  });

  it('rejects an expired code', async () => {
    const client = await registerClient();
    const { verifier, challenge } = pkcePair();
    const decision = await formPost(
      '/oauth/authorize/decision',
      { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state: 's', decision: 'allow' },
      ceoCookie,
    );
    const code = new URL(decision.location).searchParams.get('code');
    await testDb.oAuthCode.update({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await api('/oauth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', code, redirect_uri: client.redirectUri, client_id: client.client_id, code_verifier: verifier },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a mismatched redirect_uri at the token endpoint', async () => {
    const client = await registerClient();
    const { verifier, challenge } = pkcePair();
    const decision = await formPost(
      '/oauth/authorize/decision',
      { client_id: client.client_id, redirect_uri: client.redirectUri, code_challenge: challenge, state: 's', decision: 'allow' },
      ceoCookie,
    );
    const code = new URL(decision.location).searchParams.get('code');

    const res = await api('/oauth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', code, redirect_uri: 'https://different.example.com', client_id: client.client_id, code_verifier: verifier },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported grant_type', async () => {
    const res = await api('/oauth/token', { method: 'POST', body: { grant_type: 'refresh_token' } });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('unsupported_grant_type');
  });
});
