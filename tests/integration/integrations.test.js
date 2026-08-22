import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL } from './config.js';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

describe('Slack bot and Sheets settings', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  afterAll(async () => {
    // These fields aren't clearable through the API (a blank field means "leave
    // it alone"), so reset them directly — later files must see a clean fixture.
    await testDb.settings.update({
      where: { id: 1 },
      data: { slackBotToken: null, slackChannelId: null, sheetsPrivateKey: null, sheetsClientEmail: null, sheetsSpreadsheetId: null },
    });
  });

  it('rejects a bot token that does not look like one', async () => {
    const res = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { slackBotToken: 'not-a-token' } });
    expect(res.status).toBe(400);
  });

  it('rejects a private key that does not look like one', async () => {
    const res = await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { sheetsPrivateKey: 'nope' } });
    expect(res.status).toBe(400);
  });

  it('accepts a real-shaped bot token and private key, and round-trips the plain fields', async () => {
    const res = await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: {
        slackBotToken: 'xoxb-fake-test-token',
        slackChannelId: 'C0123456789',
        sheetsPrivateKey: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
        sheetsClientEmail: 'backup@project.iam.gserviceaccount.com',
        sheetsSpreadsheetId: 'sheet123',
      },
    });
    expect(res.status).toBe(200);

    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    expect(settings.slackBotToken).toBe('xoxb-fake-test-token');
    expect(settings.slackChannelId).toBe('C0123456789');
    expect(settings.sheetsClientEmail).toBe('backup@project.iam.gserviceaccount.com');
    expect(settings.sheetsSpreadsheetId).toBe('sheet123');

    // A blank field on a later save must not wipe what is already stored.
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { slackChannel: '#syncup-workplace' } });
    const after = await testDb.settings.findUnique({ where: { id: 1 } });
    expect(after.slackBotToken).toBe('xoxb-fake-test-token');
    expect(after.sheetsPrivateKey).toContain('PRIVATE KEY');
  });

  it('a non-admin cannot touch any of these fields', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/settings', { method: 'POST', cookie: person.cookie, body: { sheetsEnabled: true } });
    expect(res.status).toBe(403);
  });

  it('round-trips the per-event personal DM toggles', async () => {
    const res = await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: {
        slackDmEnabled: true,
        slackDmOnAssign: false,
        slackDmOnAbsent: true,
        slackDmOnInactive: true,
        slackDmOnStaleBreak: true,
        slackDmOnDailyPlan: true,
        slackDmOnCheckInSoon: false,
        slackDmOnCheckin: false,
        slackDmOnCheckout: false,
        slackDmOnStatus: false,
        slackDmOnDeadline: false,
      },
    });
    expect(res.status).toBe(200);

    const settings = await testDb.settings.findUnique({ where: { id: 1 } });
    expect(settings.slackDmOnAssign).toBe(false);
    expect(settings.slackDmOnAbsent).toBe(true);
    expect(settings.slackDmOnInactive).toBe(true);
    expect(settings.slackDmOnStaleBreak).toBe(true);
    expect(settings.slackDmOnDailyPlan).toBe(true);
    expect(settings.slackDmOnCheckInSoon).toBe(false);
    expect(settings.slackDmOnCheckin).toBe(false);
    expect(settings.slackDmOnCheckout).toBe(false);
    expect(settings.slackDmOnStatus).toBe(false);
    expect(settings.slackDmOnDeadline).toBe(false);

    // restore fixture defaults for later files
    await api('/api/settings', {
      method: 'POST',
      cookie: ceoCookie,
      body: {
        slackDmEnabled: false,
        slackDmOnAssign: true,
        slackDmOnAbsent: false,
        slackDmOnInactive: false,
        slackDmOnStaleBreak: false,
        slackDmOnDailyPlan: false,
        slackDmOnCheckInSoon: true,
        slackDmOnCheckin: true,
        slackDmOnCheckout: true,
        slackDmOnStatus: true,
        slackDmOnDeadline: true,
      },
    });
  });
});

describe('EOD summary cron', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('requires CRON_SECRET as a bearer token on the scheduled path', async () => {
    const noAuth = await fetch(`${BASE_URL}/api/cron/eod-summary`);
    expect([401, 503]).toContain(noAuth.status);

    const wrong = await fetch(`${BASE_URL}/api/cron/eod-summary`, { headers: { Authorization: 'Bearer wrong' } });
    expect([401, 503]).toContain(wrong.status);
  });

  it('a non-admin cannot fire it by hand', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/cron/eod-summary', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(403);
  });

  it('an admin can fire it by hand; with the bot off it reports nothing sent', async () => {
    const res = await api('/api/cron/eod-summary', { method: 'POST', cookie: ceoCookie });
    expect(res.status).toBe(200);
    expect(res.json.sent).toBe(false);
  });
});

describe('Check-in nudge cron', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('requires CRON_SECRET as a bearer token on the scheduled path', async () => {
    const noAuth = await fetch(`${BASE_URL}/api/cron/check-in-nudge`);
    expect([401, 503]).toContain(noAuth.status);

    const wrong = await fetch(`${BASE_URL}/api/cron/check-in-nudge`, { headers: { Authorization: 'Bearer wrong' } });
    expect([401, 503]).toContain(wrong.status);
  });

  it('a non-admin cannot fire it by hand', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/cron/check-in-nudge', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(403);
  });

  it('an admin can fire it by hand', async () => {
    const res = await api('/api/cron/check-in-nudge', { method: 'POST', cookie: ceoCookie });
    expect(res.status).toBe(200);
    expect(typeof res.json.nudged).toBe('number');
  });
});

describe('Sheets sync cron', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('requires CRON_SECRET as a bearer token on the scheduled path', async () => {
    const wrong = await fetch(`${BASE_URL}/api/cron/sheets-sync`, { headers: { Authorization: 'Bearer wrong' } });
    expect([401, 503]).toContain(wrong.status);
  });

  it('a non-admin cannot fire it by hand', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/cron/sheets-sync', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(403);
  });

  it('an admin can fire it by hand; with the backup off it reports nothing synced', async () => {
    await api('/api/settings', { method: 'POST', cookie: ceoCookie, body: { sheetsEnabled: false } });
    const res = await api('/api/cron/sheets-sync', { method: 'POST', cookie: ceoCookie });
    expect(res.status).toBe(200);
    expect(res.json.synced).toBe(false);
  });
});

describe('Slack bot test endpoint', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('refuses to test without a saved token and channel', async () => {
    const res = await api('/api/settings/slack-bot-test', { method: 'POST', cookie: ceoCookie });
    expect(res.status).toBe(400);
  });

  it('a non-admin cannot trigger the test', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/settings/slack-bot-test', { method: 'POST', cookie: person.cookie });
    expect(res.status).toBe(403);
  });
});
