import { apiUser } from '../../../../lib/auth';
import { getSettings } from '../../../../lib/settings';
import { postChannelEvent } from '../../../../lib/slack';

export async function POST() {
  const { user, error } = await apiUser({ admin: true });
  if (error) return error;

  const settings = await getSettings();
  if (!settings.slackBotToken || !settings.slackChannelId) {
    return Response.json({ error: 'Save a bot token and channel ID first.' }, { status: 400 });
  }

  // The test ignores the master switch and event toggles on purpose — you test
  // a connection before you turn it on, not after.
  const result = await postChannelEvent(
    'test',
    { text: `Syncup bot is connected. Test sent by ${user.name}.` },
    { ...settings, slackBotEnabled: true },
  );

  if (!result.sent) {
    return Response.json({ error: `Slack refused it (${result.reason}).` }, { status: 502 });
  }
  return Response.json({ ok: true });
}
