import { prisma } from './db';
import { getSettings, checkInDeadline, holidayKeySet } from './settings';
import {
  postChannelEvent,
  checkInMessage,
  checkOutMessage,
  sendDirectMessage,
  checkedOutInactiveDm,
  taskForTodayDm,
} from './slack';
import {
  dayKey,
  dayDate,
  timeKey,
  minutesOfDay,
  previousWorkingDay,
  isWorkingDay,
  shiftDay,
} from './dates';

/// An abandoned timer shouldn't bill the whole night to "idle" — that would swamp
/// the figure. We record at most this much discarded time per dropped session.
const MAX_IDLE_RECORD_MINUTES = 120;

const OPEN_TASK_STATUSES = ['PENDING', 'PROGRESS'];

function keyOf(dateValue) {
  return dateValue.toISOString().slice(0, 10);
}

/**
 * Close out sessions whose heartbeat stopped. Runs before anything reads or
 * writes a person's day, so the numbers are always current without a background job.
 */
export async function reconcileSessions(userId, settings) {
  const cfg = settings || (await getSettings());
  const open = await prisma.workSession.findMany({ where: { userId, endedAt: null } });
  if (open.length === 0) return;

  const now = new Date();
  const idleMs = cfg.idleAfterMinutes * 60 * 1000;
  const todayKey = dayKey(now);
  const writes = [];
  let inactiveClose = false;

  for (const session of open) {
    const beat = session.lastBeatAt || session.startedAt;
    const stale = now.getTime() - beat.getTime() > idleMs;
    const fromPastDay = keyOf(session.date) !== todayKey;
    if (!stale && !fromPastDay) continue;

    // The session is only credited up to its last sign of life.
    writes.push(prisma.workSession.update({ where: { id: session.id }, data: { endedAt: beat } }));
    if (session.kind === 'WORK' && stale) inactiveClose = true;

    if (session.kind === 'WORK') {
      const cap = new Date(beat.getTime() + MAX_IDLE_RECORD_MINUTES * 60 * 1000);
      const idleEnd = new Date(Math.min(now.getTime(), cap.getTime()));
      if (idleEnd.getTime() > beat.getTime()) {
        writes.push(
          prisma.workSession.create({
            data: {
              userId,
              date: session.date,
              kind: 'IDLE',
              startedAt: beat,
              endedAt: idleEnd,
            },
          }),
        );
      }
    }
  }

  if (writes.length) await prisma.$transaction(writes);

  // Only fires once — the session that triggered it is no longer open on the
  // next pass, so this can never repeat for the same dropped stretch.
  if (inactiveClose) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, slackUserId: true },
    });
    if (user) {
      const totals = await dayTotals(userId, todayKey);
      await sendDirectMessage('inactive', user, checkedOutInactiveDm(totals.work, cfg.idleAfterMinutes), cfg);
    }
  }
}

/** Minutes of work, break and idle for one person on one day. */
export async function dayTotals(userId, key) {
  const sessions = await prisma.workSession.findMany({
    where: { userId, date: dayDate(key) },
  });
  const now = Date.now();
  const totals = { work: 0, break: 0, idle: 0, running: null };

  for (const s of sessions) {
    const end = s.endedAt ? s.endedAt.getTime() : now;
    const minutes = Math.max(0, (end - s.startedAt.getTime()) / 60000);
    if (s.kind === 'WORK') totals.work += minutes;
    else if (s.kind === 'BREAK') totals.break += minutes;
    else totals.idle += minutes;
    if (!s.endedAt) totals.running = { id: s.id, kind: s.kind, startedAt: s.startedAt };
  }

  totals.work = Math.round(totals.work);
  totals.break = Math.round(totals.break);
  totals.idle = Math.round(totals.idle);
  return totals;
}

export async function getAttendance(userId, key) {
  return prisma.attendance.findUnique({
    where: { userId_date: { userId, date: dayDate(key) } },
  });
}

/**
 * Start the day. Records the arrival, freezes the deadline that applied, flags a
 * late arrival, opens the first work session and lays out the plan.
 */
export async function checkIn(user, key = dayKey()) {
  const settings = await getSettings();
  const existing = await getAttendance(user.id, key);
  if (existing?.checkInAt) return existing;

  const now = new Date();
  const deadline = checkInDeadline(user, settings);
  const late = minutesOfDay(timeKey(now)) > minutesOfDay(deadline);

  const attendance = await prisma.attendance.upsert({
    where: { userId_date: { userId: user.id, date: dayDate(key) } },
    create: {
      userId: user.id,
      date: dayDate(key),
      checkInAt: now,
      checkInBy: deadline,
      late,
      status: 'PRESENT',
    },
    update: { checkInAt: now, checkInBy: deadline, late, status: 'PRESENT' },
  });

  await prisma.workSession.create({
    data: { userId: user.id, date: dayDate(key), kind: 'WORK', startedAt: now, lastBeatAt: now },
  });

  await buildPlan(user, key, settings);
  await postChannelEvent('checkin', checkInMessage(user, late), settings);
  await sendDirectMessage('dailyPlan', user, taskForTodayDm(await getPlan(user.id, key)), settings);
  return attendance;
}

/** End the day: close every open session and stamp the checkout. */
export async function checkOut(user, key = dayKey()) {
  const now = new Date();
  await prisma.workSession.updateMany({
    where: { userId: user.id, endedAt: null },
    data: { endedAt: now },
  });
  const attendance = await prisma.attendance.update({
    where: { userId_date: { userId: user.id, date: dayDate(key) } },
    data: { checkOutAt: now },
  });
  const totals = await dayTotals(user.id, key);
  await postChannelEvent('checkout', checkOutMessage(user, totals.work));
  return attendance;
}

/** Switch between working and on-break. Closes whatever is open, opens the other. */
export async function switchSession(user, kind, key = dayKey()) {
  const now = new Date();
  await prisma.workSession.updateMany({
    where: { userId: user.id, endedAt: null },
    data: { endedAt: now },
  });
  if (kind === 'STOP') return null;

  // Picking work back up reopens the day — a closed-out record would otherwise
  // keep reading as finished while the clock runs.
  if (kind === 'WORK') {
    await prisma.attendance.updateMany({
      where: { userId: user.id, date: dayDate(key), checkOutAt: { not: null } },
      data: { checkOutAt: null },
    });
  }

  return prisma.workSession.create({
    data: { userId: user.id, date: dayDate(key), kind, startedAt: now, lastBeatAt: now },
  });
}

/** The client pings while the tab is alive. Silence is what makes time idle. */
export async function heartbeat(userId) {
  const now = new Date();
  await prisma.workSession.updateMany({
    where: { userId, endedAt: null },
    data: { lastBeatAt: now },
  });
}

/**
 * Lay out the plan for a day: yesterday's unfinished points carry forward, and
 * every open assigned task shows up when the setting says so.
 */
export async function buildPlan(user, key, settingsInput) {
  const settings = settingsInput || (await getSettings());
  const holidays = await holidayKeySet(shiftDay(key, -14), key);
  const holidayKeys = new Set(holidays.keys());

  const existing = await prisma.planPoint.findMany({ where: { userId: user.id, date: dayDate(key) } });
  const seenTaskIds = new Set(existing.filter((p) => p.taskId).map((p) => p.taskId));
  const seenCarry = new Set(existing.map((p) => `${p.originDate ? keyOf(p.originDate) : key}::${p.title}`));
  const creates = [];
  let order = existing.reduce((max, p) => Math.max(max, p.order), 0);

  // 1. Carry the unfinished points forward from the last working day.
  const prevKey = previousWorkingDay(key, settings.workingDays, holidayKeys);
  if (prevKey) {
    const leftovers = await prisma.planPoint.findMany({
      where: { userId: user.id, date: dayDate(prevKey), done: false, dismissed: false },
      orderBy: { order: 'asc' },
    });
    for (const point of leftovers) {
      // Task-linked points are rebuilt from the task itself in step 2.
      if (point.taskId) continue;
      const origin = point.originDate ? keyOf(point.originDate) : prevKey;
      const dedupe = `${origin}::${point.title}`;
      if (seenCarry.has(dedupe)) continue;
      seenCarry.add(dedupe);
      order += 1;
      creates.push({
        userId: user.id,
        date: dayDate(key),
        title: point.title,
        order,
        originDate: dayDate(origin),
      });
    }
  }

  // 2. Every open task assigned to them appears on today's plan.
  if (settings.planFromTasks) {
    const tasks = await prisma.task.findMany({
      where: { assigneeId: user.id, status: { in: OPEN_TASK_STATUSES } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) continue;
      order += 1;
      creates.push({
        userId: user.id,
        date: dayDate(key),
        title: task.title,
        order,
        taskId: task.id,
        originDate: dayDate(keyOf(task.createdAt) <= key ? keyOf(task.createdAt) : key),
      });
    }
  }

  if (creates.length) await prisma.planPoint.createMany({ data: creates });
}

/** Today's visible plan — dismissed points stay hidden for the day. */
export async function getPlan(userId, key) {
  return prisma.planPoint.findMany({
    where: { userId, date: dayDate(key), dismissed: false },
    orderBy: { order: 'asc' },
    include: { task: { select: { id: true, status: true, priority: true, dueDate: true } } },
  });
}

/**
 * Tick or untick a point. A point that came from a task moves the task with it,
 * so the two views never disagree.
 */
export async function setPointDone(userId, pointId, done) {
  const point = await prisma.planPoint.findFirst({ where: { id: pointId, userId } });
  if (!point) return null;

  const updated = await prisma.planPoint.update({
    where: { id: pointId },
    data: { done, doneAt: done ? new Date() : null },
  });

  if (point.taskId) {
    await prisma.task.update({
      where: { id: point.taskId },
      data: done
        ? { status: 'COMPLETED', completedAt: new Date() }
        : { status: 'PROGRESS', completedAt: null },
    });
  }
  return updated;
}

/** How many open tasks someone is holding — the number the assignment cap watches. */
export async function openTaskCount(userId) {
  return prisma.task.count({
    where: { assigneeId: userId, status: { in: OPEN_TASK_STATUSES } },
  });
}

export { OPEN_TASK_STATUSES, isWorkingDay };
