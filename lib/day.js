import { prisma } from './db';
import { getSettings, checkInDeadline, holidayKeySet } from './settings';
import {
  postChannelEvent,
  checkInMessage,
  checkOutMessage,
  sendDirectMessage,
  checkedOutInactiveDm,
  staleBreakDm,
  taskForTodayDm,
  checkInDm,
  checkOutDm,
} from './slack';
import {
  dayKey,
  dayDate,
  dateFieldKey,
  timeKey,
  minutesOfDay,
  previousWorkingDay,
  isWorkingDay,
  shiftDay,
  startOfDay,
  endOfDay,
  zonedTimeToUtc,
  closedMinutes,
} from './dates';

/// An abandoned timer shouldn't bill the whole night to "idle" — that would swamp
/// the figure. We record at most this much discarded time per dropped session.
const MAX_IDLE_RECORD_MINUTES = 120;

const OPEN_TASK_STATUSES = ['PENDING', 'PROGRESS'];

/** Ignore a second work/break click that lands this close to the last switch. */
export const SESSION_SWITCH_DEBOUNCE_MS = 5000;

function cutoffMinutes(session, settings) {
  return session.idleCutoffMinutes ?? settings.idleAfterMinutes;
}

function sessionBeat(session) {
  return session.lastBeatAt || session.startedAt;
}

function sessionNeedsReconcile(session, now, settings) {
  const beat = sessionBeat(session);
  const idleMs = cutoffMinutes(session, settings) * 60 * 1000;
  const stale = now.getTime() - beat.getTime() > idleMs;
  const fromPastDay = dateFieldKey(session.date) !== dayKey(now);
  return { beat, stale, fromPastDay, needs: stale || fromPastDay };
}

function idleCapEnd(beat, now) {
  const cap = new Date(beat.getTime() + MAX_IDLE_RECORD_MINUTES * 60 * 1000);
  return new Date(Math.min(now.getTime(), cap.getTime()));
}

function idleCreateData(userId, dateKey, beat, idleEnd, cutoff) {
  if (idleEnd.getTime() <= beat.getTime()) return null;
  return {
    userId,
    date: dayDate(dateKey),
    kind: 'IDLE',
    startedAt: beat,
    endedAt: idleEnd,
    lastBeatAt: idleEnd,
    idleCutoffMinutes: cutoff,
    openUserId: null,
  };
}

/**
 * Close out sessions whose heartbeat stopped. Runs before anything reads or
 * writes a person's day, so the numbers are always current without waiting for
 * that person to visit — a global cron also calls this for every stale timer.
 */
export async function reconcileSessions(userId, settings) {
  const cfg = settings || (await getSettings());
  const open = await prisma.workSession.findMany({ where: { userId, endedAt: null } });
  if (open.length === 0) return { closed: 0 };

  const now = new Date();
  const todayKey = dayKey(now);
  let inactiveClose = false;
  let staleBreakAlert = false;
  let staleBreakElapsed = 0;
  let closed = 0;

  await prisma.$transaction(async (tx) => {
    for (const session of open) {
      const { beat, stale, fromPastDay, needs } = sessionNeedsReconcile(session, now, cfg);
      if (!needs) continue;

      const startKey = dateFieldKey(session.date);
      const beatKey = dayKey(beat);
      const cutoff = cutoffMinutes(session, cfg);
      closed += 1;

      if (session.kind === 'WORK' && stale) inactiveClose = true;
      if (session.kind === 'BREAK' && stale && cfg.staleBreakAlertMinutes > 0) {
        const silenceMins = (now.getTime() - beat.getTime()) / 60000;
        if (silenceMins >= cfg.staleBreakAlertMinutes) {
          staleBreakAlert = true;
          staleBreakElapsed = Math.round(Math.max(0, (beat.getTime() - session.startedAt.getTime()) / 60000));
        }
      }

      const liveAcrossMidnight = fromPastDay && !stale && todayKey > startKey;
      const beatOnLaterDay = beatKey > startKey;

      if (liveAcrossMidnight || beatOnLaterDay) {
        const splitAt = endOfDay(startKey);
        const originalEnd = beatOnLaterDay ? splitAt : (splitAt.getTime() < now.getTime() ? splitAt : beat);

        await tx.workSession.update({
          where: { id: session.id },
          data: { endedAt: originalEnd, openUserId: null },
        });

        const contKey = beatOnLaterDay ? beatKey : todayKey;
        const contStart = startOfDay(contKey);
        const leaveOpen = !stale && contKey === todayKey;
        const contEnd = leaveOpen ? null : beat;

        await tx.workSession.create({
          data: {
            userId,
            date: dayDate(contKey),
            kind: session.kind,
            startedAt: contStart,
            lastBeatAt: beat.getTime() >= contStart.getTime() ? beat : contStart,
            endedAt: contEnd,
            idleCutoffMinutes: cutoff,
            openUserId: leaveOpen ? userId : null,
          },
        });

        if (session.kind === 'WORK' && stale) {
          const idleEnd = idleCapEnd(beat, now);
          const idleDate = dayKey(beat);
          const idle = idleCreateData(userId, idleDate, beat, idleEnd, cutoff);
          if (idle) await tx.workSession.create({ data: idle });
        }
      } else {
        await tx.workSession.update({
          where: { id: session.id },
          data: { endedAt: beat, openUserId: null },
        });

        if (session.kind === 'WORK') {
          const idleEnd = idleCapEnd(beat, now);
          const idle = idleCreateData(userId, startKey, beat, idleEnd, cutoff);
          if (idle) await tx.workSession.create({ data: idle });
        }
      }
    }
  });

  if (inactiveClose || staleBreakAlert) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, slackUserId: true },
    });
    if (user) {
      if (inactiveClose) {
        const totals = await dayTotals(userId, todayKey);
        await sendDirectMessage('inactive', user, checkedOutInactiveDm(totals.work, cfg.idleAfterMinutes), cfg);
      }
      if (staleBreakAlert) {
        await sendDirectMessage(
          'staleBreak',
          user,
          staleBreakDm(staleBreakElapsed, cfg.staleBreakAlertMinutes),
          cfg,
        );
      }
    }
  }

  return { closed };
}

/**
 * Close every open session in the company that is past its own idle cut-off or
 * left over from a previous company-local day. Independent of anyone visiting.
 */
export async function reconcileAllStaleSessions(settingsInput) {
  const cfg = settingsInput || (await getSettings());
  const now = new Date();
  const today = dayDate(dayKey(now));
  // Floor of the allowed idle range — anything quieter than this is a candidate;
  // each session is then judged against its own frozen idleCutoffMinutes.
  const floor = new Date(now.getTime() - 2 * 60 * 1000);

  const candidates = await prisma.workSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { lastBeatAt: { lt: floor } },
        { lastBeatAt: null, startedAt: { lt: floor } },
        { date: { lt: today } },
      ],
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  let users = 0;
  let closed = 0;
  for (const { userId } of candidates) {
    const result = await reconcileSessions(userId, cfg);
    users += 1;
    closed += result.closed;
  }
  return { users, closed };
}

/** Minutes of work, break and idle for one person on one day. */
export async function dayTotals(userId, key) {
  const sessions = await prisma.workSession.findMany({
    where: { userId, date: dayDate(key) },
  });
  const now = Date.now();
  const totals = {
    work: 0,
    break: 0,
    idle: 0,
    liveWork: 0,
    liveBreak: 0,
    liveIdle: 0,
    running: null,
  };

  for (const s of sessions) {
    if (!s.endedAt) {
      const minutes = closedMinutes(s.startedAt, new Date(now));
      if (s.kind === 'WORK') totals.liveWork += minutes;
      else if (s.kind === 'BREAK') totals.liveBreak += minutes;
      else totals.liveIdle += minutes;
      totals.running = { id: s.id, kind: s.kind, startedAt: s.startedAt };
      continue;
    }
    const minutes = closedMinutes(s.startedAt, s.endedAt);
    if (s.kind === 'WORK') totals.work += minutes;
    else if (s.kind === 'BREAK') totals.break += minutes;
    else totals.idle += minutes;
  }

  totals.work = Math.round(totals.work);
  totals.break = Math.round(totals.break);
  totals.idle = Math.round(totals.idle);
  totals.liveWork = Math.round(totals.liveWork);
  totals.liveBreak = Math.round(totals.liveBreak);
  totals.liveIdle = Math.round(totals.liveIdle);
  return totals;
}

export async function getAttendance(userId, key) {
  return prisma.attendance.findUnique({
    where: { userId_date: { userId, date: dayDate(key) } },
  });
}

function newOpenSessionData(userId, key, kind, now, cutoff) {
  return {
    userId,
    date: dayDate(key),
    kind,
    startedAt: now,
    lastBeatAt: now,
    idleCutoffMinutes: cutoff,
    openUserId: userId,
  };
}

/**
 * Start the day. Records the arrival, freezes the deadline that applied, flags a
 * late arrival, opens the first work session and lays out the plan.
 */
export async function checkIn(user, key = dayKey()) {
  const settings = await getSettings();
  await reconcileSessions(user.id, settings);

  const existing = await getAttendance(user.id, key);
  if (existing?.checkInAt) return existing;

  const now = new Date();
  const deadline = checkInDeadline(user, settings);
  const late = minutesOfDay(timeKey(now)) > minutesOfDay(deadline);

  const attendance = await prisma.$transaction(async (tx) => {
    const row = await tx.attendance.upsert({
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

    const alreadyOpen = await tx.workSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { id: true },
    });
    if (!alreadyOpen) {
      await tx.workSession.create({
        data: newOpenSessionData(user.id, key, 'WORK', now, settings.idleAfterMinutes),
      });
    }

    return row;
  });

  await buildPlan(user, key, settings);
  return attendance;
}

/**
 * The check-in notification waits for this — called once the person has
 * actually confirmed their plan for the day (ticked/added in the popup),
 * so the channel post and DM carry the real, final plan rather than
 * whatever was auto-seeded a moment before they'd looked at it.
 */
export async function confirmCheckIn(user, key = dayKey()) {
  const [settings, attendance, plan] = await Promise.all([
    getSettings(),
    getAttendance(user.id, key),
    getPlan(user.id, key),
  ]);
  const titles = plan.map((p) => p.title);
  await postChannelEvent('checkin', checkInMessage(user, !!attendance?.late, titles), settings);
  await sendDirectMessage('checkin', user, checkInDm(!!attendance?.late, titles), settings);
  await sendDirectMessage('dailyPlan', user, taskForTodayDm(plan), settings);
  return plan;
}

/** End the day: close every open session and stamp the checkout. */
export async function checkOut(user, key = dayKey()) {
  const now = new Date();
  await prisma.workSession.updateMany({
    where: { userId: user.id, endedAt: null },
    data: { endedAt: now, openUserId: null },
  });
  return prisma.attendance.update({
    where: { userId_date: { userId: user.id, date: dayDate(key) } },
    data: { checkOutAt: now },
  });
}

/**
 * The check-out notification — called once the day is actually closed, with
 * whatever got ticked done and whatever extra note they wrote, so the
 * channel post and DM read as a real end-of-day, not just a clock-out stamp.
 */
export async function sendCheckOutNotice(user, key, notes = '') {
  const [totals, donePoints] = await Promise.all([
    dayTotals(user.id, key),
    prisma.planPoint.findMany({
      where: { userId: user.id, date: dayDate(key), dismissed: false, done: true },
      orderBy: { order: 'asc' },
      select: { title: true },
    }),
  ]);
  const doneTitles = donePoints.map((p) => p.title);
  await postChannelEvent('checkout', checkOutMessage(user, totals.work, doneTitles, notes));
  await sendDirectMessage('checkout', user, checkOutDm(totals.work, doneTitles, notes));
}

/**
 * Admin correction for one person's one day: fix a mistaken or missing
 * check-in/out time, or clear both to mark the day absent. Recomputes `late`
 * against the person's own deadline rather than trusting whatever was there
 * before, and — only when the day had no recorded work sessions at all —
 * backfills a single session spanning the given times, so the hours actually
 * count toward attendance instead of the correction looking real but reading
 * as zero hours worked.
 */
export async function adminSetAttendance(user, key, { checkInTime, checkOutTime }) {
  const settings = await getSettings();
  const deadline = checkInDeadline(user, settings);
  const date = dayDate(key);

  const checkInAt = checkInTime ? zonedTimeToUtc(key, checkInTime) : null;
  const checkOutAt = checkInAt && checkOutTime ? zonedTimeToUtc(key, checkOutTime) : null;
  const late = checkInAt ? minutesOfDay(checkInTime) > minutesOfDay(deadline) : false;
  const status = checkInAt ? 'PRESENT' : 'ABSENT';

  const attendance = await prisma.attendance.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, checkInAt, checkOutAt, checkInBy: deadline, late, status },
    update: { checkInAt, checkOutAt, checkInBy: deadline, late, status },
  });

  let sessionCreated = false;
  if (checkInAt && checkOutAt) {
    const existingSessions = await prisma.workSession.count({ where: { userId: user.id, date } });
    if (existingSessions === 0) {
      await prisma.workSession.create({
        data: {
          userId: user.id,
          date,
          kind: 'WORK',
          startedAt: checkInAt,
          endedAt: checkOutAt,
          lastBeatAt: checkOutAt,
          idleCutoffMinutes: settings.idleAfterMinutes,
          openUserId: null,
        },
      });
      sessionCreated = true;
    }
  }

  return { attendance, sessionCreated };
}

function snapshotSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    userId: session.userId,
    date: dateFieldKey(session.date),
    kind: session.kind,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
  };
}

const SESSION_KINDS = ['WORK', 'BREAK', 'IDLE'];

/**
 * Admin correction of one session's times and kind. Requires a reason, writes
 * an audit row, and will not leave two sessions open for the same person.
 */
export async function adminEditSession(actorId, sessionId, { startedAt, endedAt, kind, reason }) {
  const why = String(reason || '').trim();
  if (why.length < 3) {
    return { error: 'A reason is required.', status: 400 };
  }
  if (kind && !SESSION_KINDS.includes(kind)) {
    return { error: 'kind must be WORK, BREAK or IDLE.', status: 400 };
  }

  const session = await prisma.workSession.findUnique({ where: { id: sessionId } });
  if (!session) return { error: 'No such session.', status: 404 };

  const nextStart = startedAt ? new Date(startedAt) : session.startedAt;
  const nextEnd = endedAt === undefined ? session.endedAt : endedAt ? new Date(endedAt) : null;
  const nextKind = kind || session.kind;

  if (Number.isNaN(nextStart.getTime()) || (nextEnd && Number.isNaN(nextEnd.getTime()))) {
    return { error: 'Not a valid time.', status: 400 };
  }
  if (nextEnd && nextEnd.getTime() <= nextStart.getTime()) {
    return { error: 'endedAt must be after startedAt.', status: 400 };
  }

  if (nextEnd === null) {
    const otherOpen = await prisma.workSession.findFirst({
      where: { userId: session.userId, endedAt: null, id: { not: session.id } },
      select: { id: true },
    });
    if (otherOpen) {
      return { error: 'That person already has an open session.', status: 409 };
    }
  }

  const before = snapshotSession(session);
  const updated = await prisma.workSession.update({
    where: { id: session.id },
    data: {
      startedAt: nextStart,
      endedAt: nextEnd,
      kind: nextKind,
      lastBeatAt: nextEnd || session.lastBeatAt || nextStart,
      date: dayDate(dayKey(nextStart)),
      openUserId: nextEnd ? null : session.userId,
    },
  });

  await prisma.sessionAuditLog.create({
    data: {
      actorId,
      action: 'EDIT',
      reason: why,
      userId: session.userId,
      before,
      after: snapshotSession(updated),
    },
  });

  return { session: updated };
}

/**
 * Merge two sessions on the same person into one. Adjacent (or slightly
 * overlapping) stretches only; keepId is the surviving row.
 */
export async function adminMergeSessions(actorId, keepId, absorbId, reason) {
  const why = String(reason || '').trim();
  if (why.length < 3) {
    return { error: 'A reason is required.', status: 400 };
  }
  if (!keepId || !absorbId || keepId === absorbId) {
    return { error: 'Two different sessions are required.', status: 400 };
  }

  const [keep, absorb] = await Promise.all([
    prisma.workSession.findUnique({ where: { id: keepId } }),
    prisma.workSession.findUnique({ where: { id: absorbId } }),
  ]);
  if (!keep || !absorb) return { error: 'No such session.', status: 404 };
  if (keep.userId !== absorb.userId) {
    return { error: 'Sessions belong to different people.', status: 400 };
  }

  const earlier = keep.startedAt <= absorb.startedAt ? keep : absorb;
  const later = earlier === keep ? absorb : keep;
  const earlierEnd = earlier.endedAt ? earlier.endedAt.getTime() : Date.now();
  const gapMs = later.startedAt.getTime() - earlierEnd;
  if (gapMs > 60 * 1000) {
    return { error: 'Those sessions are not adjacent (more than a minute apart).', status: 400 };
  }

  const eitherOpen = !keep.endedAt || !absorb.endedAt;
  const mergedEnd = eitherOpen
    ? null
    : new Date(Math.max(keep.endedAt.getTime(), absorb.endedAt.getTime()));
  const mergedStart = keep.startedAt <= absorb.startedAt ? keep.startedAt : absorb.startedAt;

  if (mergedEnd === null) {
    const otherOpen = await prisma.workSession.findFirst({
      where: { userId: keep.userId, endedAt: null, id: { notIn: [keep.id, absorb.id] } },
      select: { id: true },
    });
    if (otherOpen) {
      return { error: 'That person already has an open session.', status: 409 };
    }
  }

  const before = { keep: snapshotSession(keep), absorb: snapshotSession(absorb) };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.workSession.delete({ where: { id: absorb.id } });
    const row = await tx.workSession.update({
      where: { id: keep.id },
      data: {
        startedAt: mergedStart,
        endedAt: mergedEnd,
        lastBeatAt: mergedEnd || later.lastBeatAt || keep.lastBeatAt,
        date: earlier.date,
        openUserId: mergedEnd ? null : keep.userId,
      },
    });
    await tx.sessionAuditLog.create({
      data: {
        actorId,
        action: 'MERGE',
        reason: why,
        userId: keep.userId,
        before,
        after: snapshotSession(row),
      },
    });
    return row;
  });

  return { session: updated };
}

/** Switch between working and on-break. Closes whatever is open, opens the other. */
export async function switchSession(user, kind, key = dayKey()) {
  const settings = await getSettings();
  const now = new Date();

  const latest = await prisma.workSession.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true, kind: true, endedAt: true },
  });
  // Only debounce a still-open session. A closed WORK from check-in + check-out
  // a moment ago must not block "Back to work" from reopening the day.
  if (
    latest &&
    latest.endedAt == null &&
    latest.kind === kind &&
    now.getTime() - latest.startedAt.getTime() < SESSION_SWITCH_DEBOUNCE_MS
  ) {
    return { skipped: true, session: null };
  }

  try {
    const session = await prisma.$transaction(async (tx) => {
      await tx.workSession.updateMany({
        where: { userId: user.id, endedAt: null },
        data: { endedAt: now, openUserId: null },
      });
      if (kind === 'STOP') return null;

      if (kind === 'WORK') {
        await tx.attendance.updateMany({
          where: { userId: user.id, date: dayDate(key), checkOutAt: { not: null } },
          data: { checkOutAt: null },
        });
      }

      return tx.workSession.create({
        data: newOpenSessionData(user.id, key, kind, now, settings.idleAfterMinutes),
      });
    });
    return { skipped: false, session };
  } catch (err) {
    if (err?.code === 'P2002') return { skipped: true, session: null };
    throw err;
  }
}

/**
 * The client pings while the tab is alive. Silence is what makes time idle.
 * A beat that would land on an already-stale or previous-day session reconciles
 * first — otherwise a wake-from-sleep ping would silently convert sleep into work.
 */
export async function heartbeat(userId) {
  const settings = await getSettings();
  const now = new Date();
  const open = await prisma.workSession.findMany({ where: { userId, endedAt: null } });
  if (open.length === 0) return { reconciled: false };

  const dirty = open.some((session) => sessionNeedsReconcile(session, now, settings).needs);
  if (dirty) await reconcileSessions(userId, settings);

  await prisma.workSession.updateMany({
    where: { userId, endedAt: null },
    data: { lastBeatAt: now },
  });
  return { reconciled: dirty };
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
  const seenCarry = new Set(existing.map((p) => `${p.originDate ? dateFieldKey(p.originDate) : key}::${p.title}`));
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
      const origin = point.originDate ? dateFieldKey(point.originDate) : prevKey;
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
      const createdKey = dayKey(task.createdAt);
      creates.push({
        userId: user.id,
        date: dayDate(key),
        title: task.title,
        order,
        taskId: task.id,
        originDate: dayDate(createdKey <= key ? createdKey : key),
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
