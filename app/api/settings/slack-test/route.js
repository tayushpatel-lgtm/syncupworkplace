import { apiUser } from '../../../../lib/auth';
import { getSettings } from '../../../../lib/settings';
import { postToSlack } from '../../../../lib/slack';

export async function POST() {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const settings = await getSettings();
  if (!settings.slackWebhookUrl) {
    return Response.json({ error: 'No webhook is saved yet.' }, { status: 400 });
  }

  // The test ignores the master switch on purpose — you test a hook before you
  // turn it on, not after.
  const res = await fetch(settings.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `Syncup is connected. Test sent by ${user.name}.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Syncup is connected.*\nTest sent by ${user.name}${
              settings.slackChannel ? ` · ${settings.slackChannel}` : ''
            }`,
          },
        },
      ],
    }),
  }).catch((err) => ({ ok: false, status: err.message }));

  if (!res.ok) {
    return Response.json({ error: `Slack refused it (${res.status}).` }, { status: 502 });
  }

  return Response.json({ ok: true });
}
