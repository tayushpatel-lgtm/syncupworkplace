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
