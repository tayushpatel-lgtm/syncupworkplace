import { prisma } from '../../../lib/db';
import { apiUser } from '../../../lib/auth';
import { SETTINGS_ID, getSettings } from '../../../lib/settings';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  await getSettings(); // make sure the row exists before we update it
  const body = await request.json().catch(() => ({}));
  const data = {};

  if (body.assignmentCap !== undefined) {
    const cap = Number(body.assignmentCap);
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) {
      return Response.json({ error: 'The cap has to be between 1 and 200.' }, { status: 400 });
    }
    data.assignmentCap = cap;
  }

  if (body.workingDays !== undefined) {
    const days = [...new Set((body.workingDays || []).map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      .sort((a, b) => a - b);
    if (days.length === 0) {
      return Response.json({ error: 'At least one day has to count as working.' }, { status: 400 });
    }
    data.workingDays = days;
  }

  if (body.defaultCheckInBy !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.defaultCheckInBy)) {
      return Response.json({ error: 'The check-in time must read HH:MM.' }, { status: 400 });
    }
    data.defaultCheckInBy = body.defaultCheckInBy;
  }

  if (body.idleAfterMinutes !== undefined) {
    const mins = Number(body.idleAfterMinutes);
    if (!Number.isInteger(mins) || mins < 2 || mins > 120) {
      return Response.json({ error: 'Idle cut-off must be 2 to 120 minutes.' }, { status: 400 });
    }
    data.idleAfterMinutes = mins;
  }

  if (body.minPresentMinutes !== undefined) {
    const mins = Number(body.minPresentMinutes);
    if (!Number.isInteger(mins) || mins < 30 || mins > 720) {
      return Response.json(
        { error: 'The minimum for present must be 30 to 720 minutes.' },
        { status: 400 },
      );
    }
    data.minPresentMinutes = mins;
  }

  for (const flag of [
    'reportRequired',
    'planFromTasks',
    'onboardingEnforced',
    'slackEnabled',
    'slackOnAssign',
    'slackOnStatus',
    'slackOnDeadline',
    'slackBotEnabled',
    'slackOnCheckin',
    'slackOnCheckout',
    'slackOnEodSummary',
    'slackDmEnabled',
    'slackDmOnAssign',
    'slackDmOnAbsent',
    'slackDmOnInactive',
    'slackDmOnDailyPlan',
    'slackDmOnCheckin',
    'slackDmOnCheckout',
    'slackDmOnStatus',
    'slackDmOnDeadline',
    'sheetsEnabled',
  ]) {
    if (body[flag] !== undefined) data[flag] = !!body[flag];
  }

  if (body.slackChannel !== undefined) data.slackChannel = String(body.slackChannel).trim() || null;
  if (body.slackChannelId !== undefined) data.slackChannelId = String(body.slackChannelId).trim() || null;
  if (body.sheetsSpreadsheetId !== undefined) {
    data.sheetsSpreadsheetId = String(body.sheetsSpreadsheetId).trim() || null;
  }
  if (body.sheetsClientEmail !== undefined) {
    data.sheetsClientEmail = String(body.sheetsClientEmail).trim() || null;
  }

  // Only overwrite the webhook when a new one is actually typed — the form sends
  // a blank field on every other save, and that must not wipe a working hook.
  if (body.slackWebhookUrl) {
    const url = String(body.slackWebhookUrl).trim();
    if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
      return Response.json(
        { error: 'That does not look like a Slack incoming webhook URL.' },
        { status: 400 },
      );
    }
    data.slackWebhookUrl = url;
  }

  // Same rule for the bot token and the service-account private key — a blank
  // field on save must never wipe a credential that is already stored.
  if (body.slackBotToken) {
    const token = String(body.slackBotToken).trim();
    if (!/^xoxb-/.test(token)) {
      return Response.json({ error: 'That does not look like a Slack bot token (starts with xoxb-).' }, { status: 400 });
    }
    data.slackBotToken = token;
  }

  if (body.sheetsPrivateKey) {
    const key = String(body.sheetsPrivateKey).trim();
    if (!key.includes('PRIVATE KEY')) {
      return Response.json({ error: 'That does not look like a private key from a service account JSON key.' }, { status: 400 });
    }
    data.sheetsPrivateKey = key;
  }

  await prisma.settings.update({ where: { id: SETTINGS_ID }, data });
  return Response.json({ ok: true });
}
