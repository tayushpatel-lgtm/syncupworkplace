import { currentUser, isAdmin } from '../../../../lib/auth';
import { buildEodSummary } from '../../../../lib/roll';
import { postChannelEvent, eodSummaryMessage, sendDirectMessage, markedAbsentDm } from '../../../../lib/slack';
import { dayKey } from '../../../../lib/dates';
import { safeEqual } from '../../../../lib/tokens';

/**
 * One end-of-day pass: who was present, who wasn't, and which task-linked plan
 * points never got ticked. Reachable two ways — a scheduled call carrying
 * CRON_SECRET, or an admin pressing the button on the Settings page.
 */
async function runPass() {
  const key = dayKey();
  const summary = await buildEodSummary(key);
  if (!summary.working) {
    return { sent: false, reason: summary.holidayName ? `holiday: ${summary.holidayName}` : 'not a working day' };
  }
  const result = await postChannelEvent('eodSummary', eodSummaryMessage(summary));

  for (const person of summary.absentUsers) {
    await sendDirectMessage('absent', person, markedAbsentDm(summary.date));
  }

  return { ...result, present: summary.present.length, absent: summary.absent.length, notPickedUp: summary.notPickedUp.length };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not set on this deployment.' }, { status: 503 });
  }

  const offered = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!offered || !safeEqual(offered, secret)) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 });
  }

  return Response.json(await runPass());
}

export async function POST() {
  const user = await currentUser();
  if (!user || !isAdmin(user)) {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json(await runPass());
}
