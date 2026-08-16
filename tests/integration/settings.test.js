import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('settings validation', () => {
  let ceoCookie;
  let original;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    original = await testDb.settings.findUnique({ where: { id: 1 } });
  });

  afterEach(async () => {
    // Every test in here either fails validation (nothing changed) or mutates
    // a field — put it back so later files see the fixture as it started.
    await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: {
        assignmentCap: original.assignmentCap,
        workingDays: original.workingDays,
        defaultCheckInBy: original.defaultCheckInBy,
        idleAfterMinutes: original.idleAfterMinutes,
        minPresentMinutes: original.minPresentMinutes,
      },
    });
  });

  it('rejects an assignment cap of zero', async () => {
    const res = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { assignmentCap: 0 } });
    expect(res.status).toBe(400);
  });

  it('rejects an empty working week', async () => {
    const res = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { workingDays: [] } });
    expect(res.status).toBe(400);
  });

  it('rejects a check-in time that is not HH:MM', async () => {
    const res = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { defaultCheckInBy: '9:30am' } });
    expect(res.status).toBe(400);
  });

  it('rejects an idle cut-off outside 2..120 minutes', async () => {
    const tooLow = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 1 } });
    const tooHigh = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { idleAfterMinutes: 121 } });
    expect(tooLow.status).toBe(400);
    expect(tooHigh.status).toBe(400);
  });

  it('rejects a present-threshold outside 30..720 minutes', async () => {
    const tooLow = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { minPresentMinutes: 29 } });
    const tooHigh = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { minPresentMinutes: 721 } });
    expect(tooLow.status).toBe(400);
    expect(tooHigh.status).toBe(400);
  });

  it('rejects a Slack webhook URL that is not really one', async () => {
    const res = await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: { slackWebhookUrl: 'https://evil.example.com/steal' },
    });
    expect(res.status).toBe(400);
  });

  it('accepts values at the exact edge of each valid range', async () => {
    const res = await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: { assignmentCap: 1, idleAfterMinutes: 2, minPresentMinutes: 30 },
    });
    expect(res.status).toBe(200);
  });

  it('a non-admin cannot change settings at all', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/settings', { method: 'POST', cookie: person.cookie, body: { assignmentCap: 5 } });
    expect(res.status).toBe(403);
  });
});
