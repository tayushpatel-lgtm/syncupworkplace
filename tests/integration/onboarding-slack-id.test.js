import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

// The Slack ID step is added to the shared onboarding checklist for the
// duration of this file only, and removed in afterAll — every other file's
// createPerson() ticks whatever steps exist without passing a "value", so a
// lingering SLACK_ID step would leave every later fixture person stuck at
// the onboarding gate. fileParallelism is off (vitest.integration.config.mjs),
// so this file has the database to itself while the step exists.
describe('onboarding: Slack ID step', () => {
  let ceoCookie;
  let person;
  let stepId;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
    // Created before the Slack ID step exists, so their normal fixture
    // onboarding (the two default CHECK steps) completes cleanly.
    person = await createPerson(ceoCookie);

    const added = await api('/api/settings/onboarding', {
      method: 'POST',
      cookie: ceoCookie,
      body: { title: 'Slack ID', description: 'From here you can DM them personally.', kind: 'SLACK_ID' },
    });
    expect(added.status).toBe(200);
    const step = await testDb.onboardingStep.findFirst({ where: { title: 'Slack ID' } });
    stepId = step.id;
  });

  afterAll(async () => {
    await testDb.onboardingStep.deleteMany({ where: { id: stepId } });
  });

  it('rejects a value that does not look like a Slack member ID', async () => {
    const res = await api('/api/onboarding', {
      method: 'POST',
      cookie: person.cookie,
      body: { stepId, done: true, value: 'not-an-id' },
    });
    expect(res.status).toBe(400);

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.slackUserId).toBeNull();
  });

  it('accepts a real-shaped Slack member ID, stores it on the person, and marks the step done', async () => {
    const res = await api('/api/onboarding', {
      method: 'POST',
      cookie: person.cookie,
      body: { stepId, done: true, value: 'u0123abcde' },
    });
    expect(res.status).toBe(200);

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.slackUserId).toBe('U0123ABCDE'); // normalised to uppercase

    const progress = await testDb.onboardingProgress.findUnique({
      where: { userId_stepId: { userId: person.id, stepId } },
    });
    expect(progress).not.toBeNull();
  });

  it('clearing the step also clears the stored Slack ID', async () => {
    await api('/api/onboarding', { method: 'POST', cookie: person.cookie, body: { stepId, done: true, value: 'U0123ABCDE' } });
    const res = await api('/api/onboarding', { method: 'POST', cookie: person.cookie, body: { stepId, done: false } });
    expect(res.status).toBe(200);

    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.slackUserId).toBeNull();

    const progress = await testDb.onboardingProgress.findUnique({
      where: { userId_stepId: { userId: person.id, stepId } },
    });
    expect(progress).toBeNull();
  });

  it('a plain CHECK step never touches slackUserId', async () => {
    const other = await testDb.onboardingStep.findFirst({ where: { kind: 'CHECK' } });
    await api('/api/onboarding', { method: 'POST', cookie: person.cookie, body: { stepId: other.id, done: true } });
    const row = await testDb.user.findUnique({ where: { id: person.id } });
    expect(row.slackUserId).toBeNull();
  });
});
