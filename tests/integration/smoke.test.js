import { describe, it, expect, beforeAll } from 'vitest';
import { api, page, loginAsCeo, createPerson } from './helpers.js';

const EMPLOYEE_PAGES = ['/', '/tasks', '/apps', '/apps/passwords', '/calendar', '/leave', '/holidays'];
const ADMIN_PAGES = [
  '/admin',
  '/admin/reports',
  '/admin/reports?tab=person',
  '/admin/attendance',
  '/admin/people',
  '/admin/tasks',
  '/admin/leave',
  '/admin/insights',
  '/admin/passwords',
  '/admin/settings',
];

describe('page sweep', () => {
  let ceoCookie;
  let employee;
  let taskId;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    employee = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: ceoCookie,
      body: { title: 'Smoke test task', assigneeId: employee.id },
    });
    taskId = task.json.id;
  });

  it('every employee page 200s for a signed-in admin', async () => {
    for (const path of [...EMPLOYEE_PAGES, `/tasks/${taskId}`]) {
      const res = await page(path, { cookie: ceoCookie });
      expect(res.status, `${path} should 200 for an admin`).toBe(200);
    }
  });

  it('every admin page 200s for a signed-in admin', async () => {
    for (const path of ADMIN_PAGES) {
      const res = await page(path, { cookie: ceoCookie });
      expect(res.status, `${path} should 200 for an admin`).toBe(200);
    }
  });

  it('every employee page 200s for a plain employee', async () => {
    for (const path of EMPLOYEE_PAGES) {
      const res = await page(path, { cookie: employee.cookie });
      expect(res.status, `${path} should 200 for an employee`).toBe(200);
    }
  });

  it('admin pages redirect a plain employee away, not error', async () => {
    for (const path of ADMIN_PAGES) {
      const res = await page(path, { cookie: employee.cookie });
      expect(res.status, `${path} should redirect a non-admin`).toBe(307);
    }
  });

  it('every page redirects to /login when signed out', async () => {
    for (const path of [...EMPLOYEE_PAGES, ...ADMIN_PAGES]) {
      const res = await page(path);
      expect(res.status, `${path} should redirect when signed out`).toBe(307);
      expect(res.location, `${path} should redirect to /login`).toContain('/login');
    }
  });
});
