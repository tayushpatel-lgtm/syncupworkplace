import { prisma } from './db';
import { getSettings } from './settings';

/**
 * Post one message to the configured incoming webhook. Every call is gated on the
 * master switch plus the per-event toggle, so turning "Post to Slack" off silences
 * everything below it. Failures are swallowed — Slack being down must never break
 * a task assignment.
 */
export async function postToSlack(event, blocks) {
  try {
    const settings = await getSettings();
    if (!settings.slackEnabled || !settings.slackWebhookUrl) return { sent: false, reason: 'off' };

    const gate = {
      assign: settings.slackOnAssign,
      status: settings.slackOnStatus,
      deadline: settings.slackOnDeadline,
      test: true,
    };
    if (!gate[event]) return { sent: false, reason: 'event-off' };

    const res = await fetch(settings.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blocks),
    });
    if (!res.ok) return { sent: false, reason: `slack ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

const PRIORITY_MARK = { HIGH: ':red_circle:', MEDIUM: ':large_yellow_circle:', LOW: ':white_circle:' };

export function taskAssignedMessage(task, assignee, creator) {
  const due = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : 'no deadline';
  return {
    text: `New task for ${assignee.name}: ${task.title}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*New task for ${assignee.name}*\n${task.title}` },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${PRIORITY_MARK[task.priority] || ''} ${task.priority.toLowerCase()} · due ${due} · from ${creator.name}`,
          },
        ],
      },
    ],
  };
}

const STATUS_WORD = {
  PENDING: 'pending',
  PROGRESS: 'in progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
};

export function statusChangeMessage(task, assignee, from, to) {
  return {
    text: `${task.title}: ${STATUS_WORD[from]} → ${STATUS_WORD[to]}`,
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*${assignee.name}* · ${task.title} · ${STATUS_WORD[from]} → *${STATUS_WORD[to]}*`,
          },
        ],
      },
    ],
  };
}

export function deadlineMessage(lines) {
  return {
    text: `${lines.length} task${lines.length === 1 ? '' : 's'} need attention`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deadlines*\n${lines.map((l) => `• ${l}`).join('\n')}`,
        },
      },
    ],
  };
}

// --- Slack bot app: channel posts and personal DMs via chat.postMessage ---
// Independent of the webhook path above. Gated on its own master switch
// (slackBotEnabled) so turning the original webhook off never silences this,
// and vice versa.

async function slackGet(method, token, params) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function slackPost(method, token, body) {
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** A Slack user ID for one person's email, cached on the User row once resolved. */
export async function resolveSlackUserId(user, token) {
  if (user.slackUserId) return user.slackUserId;
  const result = await slackGet('users.lookupByEmail', token, { email: user.email });
  if (!result.ok || !result.user?.id) return null;
  await prisma.user
    .update({ where: { id: user.id }, data: { slackUserId: result.user.id } })
    .catch(() => {});
  return result.user.id;
}

const CHANNEL_EVENTS = ['checkin', 'checkout', 'eodSummary', 'test'];

/**
 * Post one message to the bot-configured channel. Failures are swallowed the
 * same way the webhook path does — Slack being down must never break the app.
 */
export async function postChannelEvent(event, payload, settingsInput) {
  try {
    const settings = settingsInput || (await getSettings());
    if (!settings.slackBotEnabled || !settings.slackBotToken || !settings.slackChannelId) {
      return { sent: false, reason: 'off' };
    }
    const gate = {
      checkin: settings.slackOnCheckin,
      checkout: settings.slackOnCheckout,
      eodSummary: settings.slackOnEodSummary,
      test: true,
    };
    if (!CHANNEL_EVENTS.includes(event) || !gate[event]) return { sent: false, reason: 'event-off' };

    const result = await slackPost('chat.postMessage', settings.slackBotToken, {
      channel: settings.slackChannelId,
      ...payload,
    });
    if (!result.ok) return { sent: false, reason: result.error || 'slack-error' };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/**
 * DM one person. Gated on both the bot master switch and the separate DM
 * switch, so channel updates can run without ever messaging anyone directly.
 */
export async function sendDirectMessage(user, payload, settingsInput) {
  try {
    const settings = settingsInput || (await getSettings());
    if (!settings.slackBotEnabled || !settings.slackDmEnabled || !settings.slackBotToken) {
      return { sent: false, reason: 'off' };
    }
    const slackId = await resolveSlackUserId(user, settings.slackBotToken);
    if (!slackId) return { sent: false, reason: 'no-slack-account' };

    const result = await slackPost('chat.postMessage', settings.slackBotToken, {
      channel: slackId,
      ...payload,
    });
    if (!result.ok) return { sent: false, reason: result.error || 'slack-error' };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export function checkInMessage(user, late) {
  return {
    text: `${user.name} checked in${late ? ' (late)' : ''}`,
    blocks: [
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${late ? ':warning:' : ':white_check_mark:'} *${user.name}* checked in${late ? ' — late' : ''}` }],
      },
    ],
  };
}

export function checkOutMessage(user, minutesWorked) {
  const hours = (minutesWorked / 60).toFixed(1);
  return {
    text: `${user.name} checked out`,
    blocks: [
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `:door: *${user.name}* checked out · ${hours}h recorded today` }],
      },
    ],
  };
}

export function eodSummaryMessage({ date, present, absent, notPickedUp }) {
  const lines = [
    `*End of day — ${date}*`,
    `Present (${present.length}): ${present.length ? present.join(', ') : 'nobody'}`,
    `Absent (${absent.length}): ${absent.length ? absent.join(', ') : 'nobody'}`,
  ];
  if (notPickedUp.length) {
    lines.push(`*Not picked up (${notPickedUp.length}):*`);
    lines.push(...notPickedUp.map((t) => `• ${t}`));
  } else {
    lines.push('Every planned task was picked up today.');
  }
  return {
    text: `End of day for ${date}`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  };
}

export function taskAssignedDm(task, creator) {
  const due = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : 'no deadline';
  return {
    text: `${creator.name} assigned you: ${task.title}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${creator.name} assigned you a task*\n${task.title}\ndue ${due}` },
      },
    ],
  };
}
