import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('tasks', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  describe('assignment cap', () => {
    let originalCap;

    beforeAll(async () => {
      const settings = await testDb.settings.findUnique({ where: { id: 1 } });
      originalCap = settings.assignmentCap;
      await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { assignmentCap: 1 } });
    });

    afterAll(async () => {
      await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { assignmentCap: originalCap } });
    });

    it('blocks a second open task once the per-person cap is hit', async () => {
      const person = await createPerson(ceoCookie);

      const first = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'First task', assigneeId: person.id },
      });
      expect(first.status).toBe(200);

      const second = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Second task', assigneeId: person.id },
      });
      expect(second.status).toBe(409);
      expect(second.json.error).toMatch(/open tasks/);
    });

    it('does not count a completed task against the cap', async () => {
      const person = await createPerson(ceoCookie);

      const first = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Will be completed', assigneeId: person.id },
      });
      await api(`/api/tasks/${first.json.id}`, {
        method: 'PATCH',
        cookie: ceoCookie,
        body: { status: 'COMPLETED' },
      });

      const second = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Should fit now', assigneeId: person.id },
      });
      expect(second.status).toBe(200);
    });
  });

  describe('permission to move a task', () => {
    it('the assignee can move their own task', async () => {
      const assignee = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Assignee-movable', assigneeId: assignee.id },
      });
      const moved = await api(`/api/tasks/${created.json.id}`, {
        method: 'PATCH',
        cookie: assignee.cookie,
        body: { status: 'PROGRESS' },
      });
      expect(moved.status).toBe(200);
    });

    it('a bystander with no relation to the task cannot move it', async () => {
      const assignee = await createPerson(ceoCookie);
      const bystander = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Not yours', assigneeId: assignee.id },
      });
      const moved = await api(`/api/tasks/${created.json.id}`, {
        method: 'PATCH',
        cookie: bystander.cookie,
        body: { status: 'PROGRESS' },
      });
      expect(moved.status).toBe(403);
    });

    it('an admin can move anyone\'s task', async () => {
      const assignee = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Admin-movable', assigneeId: assignee.id },
      });
      const moved = await api(`/api/tasks/${created.json.id}`, {
        method: 'PATCH',
        cookie: ceoCookie,
        body: { status: 'BLOCKED' },
      });
      expect(moved.status).toBe(200);
    });
  });

  describe('deleting a task', () => {
    it('the creator can delete it', async () => {
      const assignee = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Creator can delete', assigneeId: assignee.id },
      });
      const deleted = await api(`/api/tasks/${created.json.id}`, { method: 'DELETE', cookie: ceoCookie });
      expect(deleted.status).toBe(200);
    });

    it('the assignee cannot delete a task they did not create', async () => {
      const assignee = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Assignee cannot delete', assigneeId: assignee.id },
      });
      const deleted = await api(`/api/tasks/${created.json.id}`, { method: 'DELETE', cookie: assignee.cookie });
      expect(deleted.status).toBe(403);
    });
  });

  describe('plan point stays in step with the task', () => {
    it('completing the task from the board ticks its plan point, and moving it back unticks it', async () => {
      const person = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Synced task', assigneeId: person.id },
      });

      // Checking in pulls the open task onto today's plan (planFromTasks is on by default).
      await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });

      let point = await testDb.planPoint.findFirst({ where: { taskId: created.json.id } });
      expect(point).not.toBeNull();
      expect(point.done).toBe(false);

      await api(`/api/tasks/${created.json.id}`, { method: 'PATCH', cookie: person.cookie, body: { status: 'COMPLETED' } });
      point = await testDb.planPoint.findFirst({ where: { taskId: created.json.id } });
      expect(point.done).toBe(true);

      await api(`/api/tasks/${created.json.id}`, { method: 'PATCH', cookie: person.cookie, body: { status: 'PROGRESS' } });
      point = await testDb.planPoint.findFirst({ where: { taskId: created.json.id } });
      expect(point.done).toBe(false);
    });

    it('ticking the plan point from My day moves the task to completed', async () => {
      const person = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'Ticked from the plan', assigneeId: person.id },
      });
      await api('/api/day/check-in', { method: 'POST', cookie: person.cookie });
      const point = await testDb.planPoint.findFirst({ where: { taskId: created.json.id } });

      await api('/api/day/plan', {
        method: 'POST',
        cookie: person.cookie,
        body: { action: 'toggle', id: point.id, done: true },
      });

      const task = await testDb.task.findUnique({ where: { id: created.json.id } });
      expect(task.status).toBe('COMPLETED');
    });
  });

  // Wipes every task in the database — must stay the last describe block in
  // this file (fileParallelism is off, so files run one at a time, but tests
  // within a file share the same database and this one leaves it empty).
  describe('resetting every task', () => {
    it('is closed to a non-admin', async () => {
      const person = await createPerson(ceoCookie);
      const res = await api('/api/admin/tasks/reset', { method: 'POST', cookie: person.cookie });
      expect(res.status).toBe(403);
    });

    it('deletes every task company-wide, attachments included, and leaves plan points as plain points', async () => {
      const assignee = await createPerson(ceoCookie);
      const created = await api('/api/tasks', {
        method: 'POST',
        cookie: ceoCookie,
        body: { title: 'About to be wiped', assigneeId: assignee.id },
      });
      await api('/api/day/check-in', { method: 'POST', cookie: assignee.cookie });
      const point = await testDb.planPoint.findFirst({ where: { taskId: created.json.id } });
      expect(point).not.toBeNull();

      const res = await api('/api/admin/tasks/reset', { method: 'POST', cookie: ceoCookie });
      expect(res.status).toBe(200);
      expect(res.json.deleted).toBeGreaterThan(0);

      const remaining = await testDb.task.count();
      expect(remaining).toBe(0);

      const survivedPoint = await testDb.planPoint.findUnique({ where: { id: point.id } });
      expect(survivedPoint).not.toBeNull();
      expect(survivedPoint.taskId).toBeNull();
    });
  });
});
