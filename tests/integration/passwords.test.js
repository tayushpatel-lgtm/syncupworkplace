import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

async function createEntry(cookie, overrides = {}) {
  const res = await api('/api/passwords', {
    method: 'POST',
    cookie,
    body: { title: 'A shared secret', secret: 'sup3r-s3cret-99', visibility: 'PEOPLE', ...overrides },
  });
  expect(res.status).toBe(200);
  return res.json.id;
}

describe('password vault', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('stores the secret encrypted, not as plaintext', async () => {
    const owner = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie);
    const row = await testDb.passwordEntry.findUnique({ where: { id } });
    // Prisma returns a Bytes column as a Uint8Array, not a Node Buffer.
    const stored = Buffer.from(row.secret);
    const plaintext = Buffer.from('sup3r-s3cret-99', 'utf8');
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.includes(plaintext)).toBe(false);
  });

  it('the creator can reveal their own entry', async () => {
    const owner = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie);
    const res = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.json.secret).toBe('sup3r-s3cret-99');
  });

  it('an unshared PEOPLE entry is invisible to everyone else', async () => {
    const owner = await createPerson(ceoCookie);
    const stranger = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie, { shareWith: [] });

    const reveal = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: stranger.cookie });
    expect(reveal.status).toBe(403);
  });

  it('sharing with a specific person grants them reveal access', async () => {
    const owner = await createPerson(ceoCookie);
    const friend = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie, { shareWith: [friend.id] });

    const res = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: friend.cookie });
    expect(res.status).toBe(200);
    expect(res.json.secret).toBe('sup3r-s3cret-99');
  });

  it('COMPANY visibility is readable by anyone signed in', async () => {
    const owner = await createPerson(ceoCookie);
    const anyone = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie, { visibility: 'COMPANY' });
    const res = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: anyone.cookie });
    expect(res.status).toBe(200);
  });

  it('DEPARTMENT visibility only reaches that department', async () => {
    const owner = await createPerson(ceoCookie, { department: 'Engineering' });
    const sameDept = await createPerson(ceoCookie, { department: 'Engineering' });
    const otherDept = await createPerson(ceoCookie, { department: 'Sales' });
    const id = await createEntry(owner.cookie, { visibility: 'DEPARTMENT', department: 'Engineering' });

    const inDept = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: sameDept.cookie });
    const outOfDept = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: otherDept.cookie });
    expect(inDept.status).toBe(200);
    expect(outOfDept.status).toBe(403);
  });

  it("an admin can reassign an entry's sharing regardless of who created it", async () => {
    const owner = await createPerson(ceoCookie, { department: 'Engineering' });
    const target = await createPerson(ceoCookie, { department: 'Design' });
    const id = await createEntry(owner.cookie, { shareWith: [] });

    const before = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: target.cookie });
    expect(before.status).toBe(403);

    const patch = await api(`/api/passwords/${id}`, {
      method: 'PATCH',
      cookie: ceoCookie,
      body: { visibility: 'DEPARTMENT', department: 'Design' },
    });
    expect(patch.status).toBe(200);

    const after = await api(`/api/passwords/${id}/reveal`, { method: 'POST', cookie: target.cookie });
    expect(after.status).toBe(200);
  });

  it('a non-owner, non-admin cannot edit or delete an entry', async () => {
    const owner = await createPerson(ceoCookie);
    const stranger = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie);

    const patch = await api(`/api/passwords/${id}`, { method: 'PATCH', cookie: stranger.cookie, body: { title: 'Hijacked' } });
    expect(patch.status).toBe(403);

    const del = await api(`/api/passwords/${id}`, { method: 'DELETE', cookie: stranger.cookie });
    expect(del.status).toBe(403);
  });

  it('an unauthenticated reveal is rejected outright', async () => {
    const owner = await createPerson(ceoCookie);
    const id = await createEntry(owner.cookie);
    const res = await api(`/api/passwords/${id}/reveal`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
