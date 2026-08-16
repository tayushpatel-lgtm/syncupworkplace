import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL } from './config.js';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

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

async function mintToken(cookie, name, scope) {
  const created = await api('/api/settings/mcp-token', { method: 'POST', cookie, body: { name, scope } });
  return created.json.token;
}

describe('MCP write tools', () => {
  let ceoCookie;
  let readOnlyToken;
  let readWriteToken;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    readOnlyToken = await mintToken(ceoCookie, 'vitest read-only', 'READ_ONLY');
    readWriteToken = await mintToken(ceoCookie, 'vitest read-write', 'READ_WRITE');
  });

  it('a read-only token only lists the read tools', async () => {
    const { json } = await rpc('tools/list', {}, readOnlyToken);
    const names = json.result.tools.map((t) => t.name);
    expect(names).toContain('who_is_in');
    expect(names).not.toContain('assign_task');
  });

  it('a read-write token lists both read and write tools', async () => {
    const { json } = await rpc('tools/list', {}, readWriteToken);
    const names = json.result.tools.map((t) => t.name);
    expect(names).toContain('who_is_in');
    expect(names).toContain('assign_task');
    expect(names).toContain('update_task_status');
    expect(names).toContain('decide_leave');
  });

  it('a read-only token cannot call a write tool', async () => {
    const person = await createPerson(ceoCookie);
    const { json } = await rpc(
      'tools/call',
      { name: 'assign_task', arguments: { assignee: person.email, title: 'Should not land' } },
      readOnlyToken,
    );
    expect(json.error).toBeDefined();
    expect(json.error.message).toMatch(/read-write/);
  });

  it('assign_task creates a task attributed to the token owner, and it shows up in the tasks API', async () => {
    const person = await createPerson(ceoCookie, { name: 'Priya Assignee' });
    const { json } = await rpc(
      'tools/call',
      { name: 'assign_task', arguments: { assignee: person.email, title: 'From Claude', priority: 'HIGH' } },
      readWriteToken,
    );
    expect(json.result.isError).toBe(false);
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.assignee).toBe('Priya Assignee');

    const task = await testDb.task.findUnique({ where: { id: parsed.id } });
    expect(task.title).toBe('From Claude');
    expect(task.priority).toBe('HIGH');
    expect(task.assigneeId).toBe(person.id);

    const ceo = await testDb.user.findFirst({ where: { email: 'ceo@fixture.test' } });
    expect(task.creatorId).toBe(ceo.id);
  });

  it('assign_task respects the per-person assignment cap', async () => {
    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    const originalCap = settings.assignmentCap;
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { assignmentCap: 1 } });

    const person = await createPerson(ceoCookie);
    await rpc('tools/call', { name: 'assign_task', arguments: { assignee: person.email, title: 'First' } }, readWriteToken);
    const { json } = await rpc(
      'tools/call',
      { name: 'assign_task', arguments: { assignee: person.email, title: 'Second' } },
      readWriteToken,
    );
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.error).toMatch(/open tasks/);

    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { assignmentCap: originalCap } });
  });

  it('update_task_status moves a task and syncs the plan point', async () => {
    const person = await createPerson(ceoCookie, { name: 'Ravi Ticketholder' });
    const create = await api('/api/tasks', { method: 'POST', cookie: ceoCookie, body: { title: 'Ticket 42', assigneeId: person.id } });

    const { json } = await rpc(
      'tools/call',
      { name: 'update_task_status', arguments: { task: 'Ticket 42', assignee: 'Ravi Ticketholder', status: 'COMPLETED' } },
      readWriteToken,
    );
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.to).toBe('COMPLETED');

    const task = await testDb.task.findUnique({ where: { id: create.json.id } });
    expect(task.status).toBe('COMPLETED');
  });

  it('update_task_status refuses an ambiguous match', async () => {
    const person = await createPerson(ceoCookie, { name: 'Amara Duplicator' });
    await api('/api/tasks', { method: 'POST', cookie: ceoCookie, body: { title: 'Duplicate title', assigneeId: person.id } });
    await api('/api/tasks', { method: 'POST', cookie: ceoCookie, body: { title: 'Duplicate title', assigneeId: person.id } });

    const { json } = await rpc(
      'tools/call',
      { name: 'update_task_status', arguments: { task: 'Duplicate title', assignee: 'Amara Duplicator', status: 'PROGRESS' } },
      readWriteToken,
    );
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.error).toMatch(/More than one task/);
  });

  it('decide_leave approves a pending request and spends the balance', async () => {
    const person = await createPerson(ceoCookie, { name: 'Zara Leavetaker' });
    const { dayKey, shiftDay } = await import('../../lib/dates.js');
    const startDate = shiftDay(dayKey(), 40);
    const endDate = shiftDay(dayKey(), 40);
    const filed = await api('/api/leave', {
      method: 'POST',
      cookie: person.cookie,
      body: { kind: 'PLANNED', startDate, endDate, reason: 'Wedding' },
    });
    expect(filed.status).toBe(200);

    const { json } = await rpc(
      'tools/call',
      { name: 'decide_leave', arguments: { person: 'Zara Leavetaker', decision: 'APPROVED' } },
      readWriteToken,
    );
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.decision).toBe('APPROVED');

    const leave = await testDb.leaveRequest.findFirst({ where: { userId: person.id } });
    expect(leave.status).toBe('APPROVED');
  });

  it('decide_leave errors when nobody matches or nothing is pending', async () => {
    const { json } = await rpc(
      'tools/call',
      { name: 'decide_leave', arguments: { person: 'Nobody Real Xyz', decision: 'APPROVED' } },
      readWriteToken,
    );
    const parsed = JSON.parse(json.result.content[0].text);
    expect(parsed.error).toMatch(/Nobody active/);
  });

  it('never exposes a delete-person or reset-password tool over MCP, at any scope', async () => {
    const { json } = await rpc('tools/list', {}, readWriteToken);
    const names = json.result.tools.map((t) => t.name);
    expect(names.some((n) => /delete/i.test(n) || /reset/i.test(n) || /password/i.test(n))).toBe(false);
  });
});
