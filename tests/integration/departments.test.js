import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('departments', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('adds a department to the managed list', async () => {
    const res = await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: 'Engineering' } });
    expect(res.status).toBe(200);
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    expect(settings.departments).toContain('Engineering');
  });

  it('rejects a duplicate, case-insensitively', async () => {
    await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: 'Design' } });
    const res = await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: 'design' } });
    expect(res.status).toBe(409);
  });

  it('rejects a blank name', async () => {
    const res = await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: '   ' } });
    expect(res.status).toBe(400);
  });

  it('removes a department from the list', async () => {
    await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: 'Temporary' } });
    await api('/api/departments', { method: 'DELETE', cookie: ceoCookie, body: { name: 'Temporary' } });
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    expect(settings.departments).not.toContain('Temporary');
  });

  it('a non-admin cannot manage departments', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/departments', { method: 'POST', cookie: person.cookie, body: { name: 'Sneaky' } });
    expect(res.status).toBe(403);
  });

  it('setting a person\'s department to a managed value round-trips', async () => {
    await api('/api/departments', { method: 'POST', cookie: ceoCookie, body: { name: 'Sales' } });
    const person = await createPerson(ceoCookie);
    const res = await api(`/api/people/${person.id}`, { method: 'PATCH', cookie: ceoCookie, body: { department: 'Sales' } });
    expect(res.status).toBe(200);
    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.department).toBe('Sales');
  });
});
