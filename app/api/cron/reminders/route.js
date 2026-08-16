import { prisma } from '../../../../lib/db';
import { currentUser, isAdmin } from '../../../../lib/auth';
import { getSettings } from '../../../../lib/settings';
import { postToSlack, deadlineMessage, sendDirectMessage, deadlineDm } from '../../../../lib/slack';
import { dayKey, dayDate, shiftDay } from '../../../../lib/dates';
import { safeEqual } from '../../../../lib/tokens';

/**
 * One pass over deadlines: due tomorrow, due today, then once a day while a task
 * stays late. Reachable two ways — a scheduled call carrying CRON_SECRET, or an
 * admin pressing the button on the Settings page.
 */
async function runPass() {
  const settings = await getSettings();
  const today = dayKey();
  const tomorrow = shiftDay(today, 1);

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: ['PENDING', 'PROGRESS'] },
      dueDate: { not: null, lte: new Date(`${tomorrow}T00:00:00.000Z`) },
      OR: [{ lastRemindedOn: null }, { lastRemindedOn: { lt: dayDate(today) } }],
    },
    include: { assignee: { select: { id: true, name: true, email: true, slackUserId: true } } },
    orderBy: { dueDate: 'asc' },
  });

  if (tasks.length === 0) return { sent: false, reason: 'nothing is due', reminded: 0 };

  const when = (task) => {
    const due = task.dueDate.toISOString().slice(0, 10);
    return due === today ? 'due today' : due === tomorrow ? 'due tomorrow' : `late since ${due}`;
  };

  const lines = tasks.map((task) => `${task.assignee.name} — ${task.title} (${when(task)})`);
  const result = await postToSlack('deadline', deadlineMessage(lines));

  // Each person also gets just their own items — the channel line is easy to
  // miss in a shared feed everyone else is also posting into.
  const byAssignee = new Map();
  for (const task of tasks) {
    const entry = byAssignee.get(task.assigneeId) || { user: task.assignee, lines: [] };
    entry.lines.push(`${task.title} (${when(task)})`);
    byAssignee.set(task.assigneeId, entry);
  }
  for (const { user, lines: personalLines } of byAssignee.values()) {
    await sendDirectMessage('deadline', user, deadlineDm(personalLines));
  }

  // Only mark them reminded if Slack actually took the message, so a failed pass
  // retries tomorrow instead of going quiet.
  if (result.sent) {
    await prisma.task.updateMany({
      where: { id: { in: tasks.map((t) => t.id) } },
      data: { lastRemindedOn: dayDate(today) },
    });
  }

  return { ...result, reminded: result.sent ? tasks.length : 0 };
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
  // The manual path: an admin, signed in, pressing the button.
  const user = await currentUser();
  if (!user || !isAdmin(user)) {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }
  return Response.json(await runPass());
}
