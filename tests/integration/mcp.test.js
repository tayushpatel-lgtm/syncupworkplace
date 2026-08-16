import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL } from './config.js';
import { api, loginAsCeo, testDb } from './helpers.js';
import { hashToken } from '../../lib/tokens.js';

async function rpc(method, params, token) {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

describe('MCP server', () => {
  let ceoCookie;
  let token;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    const created = await api('/api/settings/mcp-token', { method: 'POST', cookie: ceoCookie, body: { name: 'vitest' } });
    token = created.json.token;
  });

  it('rejects a request with no bearer token', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a bogus token', async () => {
    const { status } = await rpc('tools/list', {}, 'not-a-real-token');
    expect(status).toBe(401);
  });

  it('lists tools with a valid token', async () => {
    const { status, json } = await rpc('tools/list', {}, token);
    expect(status).toBe(200);
    const names = json.result.tools.map((t) => t.name);
    expect(names).toContain('who_is_in');
    expect(names).toContain('over_the_cap');
  });

  it('can call a tool and get structured data back', async () => {
    const { json } = await rpc('tools/call', { name: 'over_the_cap', arguments: {} }, token);
    expect(json.result.isError).toBe(false);
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed).toHaveProperty('cap');
  });

  it('refuses an unknown tool name', async () => {
    const { json } = await rpc('tools/call', { name: 'delete_everything', arguments: {} }, token);
    expect(json.error).toBeDefined();
  });

  it('a revoked token stops working', async () => {
    const created = await api('/api/settings/mcp-token', { method: 'POST', cookie: ceoCookie, body: { name: 'to-revoke' } });
    const shortLived = created.json.token;

    const before = await rpc('tools/list', {}, shortLived);
    expect(before.status).toBe(200);

    const row = await testDb.mcpToken.findUnique({ where: { tokenHash: hashToken(shortLived) } });
    const revoke = await api('/api/settings/mcp-token', { method: 'DELETE', cookie: ceoCookie, body: { id: row.id } });
    expect(revoke.status).toBe(200);

    const after = await rpc('tools/list', {}, shortLived);
    expect(after.status).toBe(401);
  });
});
