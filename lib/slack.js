import { prisma } from './db';
import { getSettings } from './settings';

/** A Slack member ID reads like "U0123ABCDE" — from a profile's ••• menu → Copy member ID. */
export const SLACK_ID_PATTERN = /^[UW][A-Z0-9]{6,}$/i;

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

const DM_GATE_FIELD = {
  assign: 'slackDmOnAssign',
  absent: 'slackDmOnAbsent',
  inactive: 'slackDmOnInactive',
  staleBreak: 'slackDmOnStaleBreak',
  dailyPlan: 'slackDmOnDailyPlan',
  checkInSoon: 'slackDmOnCheckInSoon',
  checkin: 'slackDmOnCheckin',
  checkout: 'slackDmOnCheckout',
  status: 'slackDmOnStatus',
  deadline: 'slackDmOnDeadline',
};

/**
 * DM one person. Gated on the bot master switch, the separate DM master
 * switch, and a toggle per event — so channel updates can run without ever
 * messaging anyone, and each kind of DM can be turned on independently.
 */
export async function sendDirectMessage(event, user, payload, settingsInput) {
  try {
    const settings = settingsInput || (await getSettings());
    if (!settings.slackBotEnabled || !settings.slackDmEnabled || !settings.slackBotToken) {
      return { sent: false, reason: 'off' };
    }
    const field = DM_GATE_FIELD[event];
    if (!field || !settings[field]) return { sent: false, reason: 'event-off' };

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

/** planTitles is the finalized plan-of-the-day, confirmed at check-in. */
export function checkInMessage(user, late, planTitles = []) {
  const head = `${late ? ':warning:' : ':white_check_mark:'} *${user.name}* checked in${late ? ' — late' : ''}`;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: head } }];
  if (planTitles.length) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Plan for today:*\n${planTitles.map((t) => `• ${t}`).join('\n')}` }],
    });
  }
  return { text: `${user.name} checked in${late ? ' (late)' : ''}`, blocks };
}

/** doneTitles is what actually got ticked off by end of day; notes is the free-text extra. */
export function checkOutMessage(user, minutesWorked, doneTitles = [], notes = '') {
  const hours = (minutesWorked / 60).toFixed(1);
  const head = `:door: *${user.name}* checked out · ${hours}h recorded today`;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: head } }];
  if (doneTitles.length) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Done today:*\n${doneTitles.map((t) => `• ${t}`).join('\n')}` }],
    });
  }
  if (notes.trim()) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*Also:* ${notes.trim()}` }] });
  }
  return { text: `${user.name} checked out`, blocks };
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

export function markedAbsentDm(date) {
  return {
    text: `You were marked absent for ${date}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *You were marked absent for ${date}* — no check-in was recorded on a working day.`,
        },
      },
    ],
  };
}

export function checkInSoonDm(deadlineLabel, leadMinutes = 15) {
  return {
    text: `Check in in ${leadMinutes} minutes`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:alarm_clock: *Check-in in ${leadMinutes} minutes*\nYour start time today is *${deadlineLabel}*. Open Syncup and check in so the day is on time.`,
        },
      },
    ],
  };
}

export function checkedOutInactiveDm(minutesWorked, idleAfterMinutes, myDayUrl = '') {
  const hours = (minutesWorked / 60).toFixed(1);
  const link = myDayUrl ? `\n<${myDayUrl}|Open My day to resume work>` : '';
  return {
    text: 'Your work clock stopped after inactivity',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:pause_button: *Your work clock stopped* — no heartbeat for ${idleAfterMinutes} minutes. You're still checked in; open My day and tap *Resume work* to keep counting.\n${hours}h recorded before that.${link}`,
        },
      },
    ],
  };
}

export function staleBreakDm(breakMinutes, alertAfterMinutes) {
  const hours = (breakMinutes / 60).toFixed(1);
  return {
    text: 'Your break was closed automatically',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:tea: *Your break was closed automatically* — no activity was detected for ${alertAfterMinutes} minutes.\n${hours}h on break before that.`,
        },
      },
    ],
  };
}

export function taskForTodayDm(planPoints) {
  if (!planPoints.length) {
    return {
      text: 'Your plan for today is empty',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Your plan for today*\nNothing on it yet — add at least one point to start your day.' },
        },
      ],
    };
  }
  const lines = planPoints.map((p) => `• ${p.title}`).join('\n');
  return {
    text: `Your plan for today: ${planPoints.length} item${planPoints.length === 1 ? '' : 's'}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Your plan for today*\n${lines}` },
      },
    ],
  };
}

// --- Personal mirrors of the channel messages above — same event, sent to
// the one person it's actually about, so it doesn't depend on them catching
// it in a shared channel that everyone else is also posting into. ---

export function checkInDm(late, planTitles = []) {
  const head = `${late ? ':warning:' : ':white_check_mark:'} *You checked in*${late ? ' — late' : ''}`;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: head } }];
  if (planTitles.length) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Your plan for today:*\n${planTitles.map((t) => `• ${t}`).join('\n')}` }],
    });
  }
  return { text: `You checked in${late ? ' (late)' : ''}`, blocks };
}

export function checkOutDm(minutesWorked, doneTitles = [], notes = '') {
  const hours = (minutesWorked / 60).toFixed(1);
  const head = `:door: *You checked out* · ${hours}h recorded today`;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: head } }];
  if (doneTitles.length) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Done today:*\n${doneTitles.map((t) => `• ${t}`).join('\n')}` }],
    });
  }
  if (notes.trim()) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*Also:* ${notes.trim()}` }] });
  }
  return { text: 'You checked out', blocks };
}

export function statusChangeDm(task, from, to) {
  return {
    text: `${task.title}: ${STATUS_WORD[from]} → ${STATUS_WORD[to]}`,
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Your task* · ${task.title} · ${STATUS_WORD[from]} → *${STATUS_WORD[to]}*`,
          },
        ],
      },
    ],
  };
}

export function deadlineDm(lines) {
  return {
    text: `${lines.length} of your task${lines.length === 1 ? '' : 's'} need attention`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your deadlines*\n${lines.map((l) => `• ${l}`).join('\n')}`,
        },
      },
    ],
  };
}
