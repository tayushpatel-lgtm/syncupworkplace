import { prisma } from './db';
import { getSettings, checkInDeadline, holidayKeySet } from './settings';
import { sendDirectMessage, checkInSoonDm } from './slack';
import {
  dayKey,
  dayDate,
  timeKey,
  formatClock,
  isWorkingDay,
  isInCheckInNudgeWindow,
  isCheckInNudgeRunOpen,
  CHECK_IN_NUDGE_LEAD_MINUTES,
  CHECK_IN_NUDGE_RUN_START,
  CHECK_IN_NUDGE_RUN_END,
} from './dates';

/**
 * Whether this person should get the "check in soon" DM on this pass.
 * Pure so the window math can be unit-tested without Slack or the database.
 */
export function shouldNudgePerson({
  workingDay,
  onLeave,
  alreadyCheckedIn,
  alreadyNudgedToday,
  nowHhmm,
  deadlineHhmm,
}) {
  if (!workingDay || onLeave || alreadyCheckedIn || alreadyNudgedToday) return false;
  return isInCheckInNudgeWindow(nowHhmm, deadlineHhmm);
}

/**
 * DM everyone whose own check-in time is 15 minutes away — 09:30 people at
 * 09:15, 10:00 people at 09:45. The cron only runs 08:30–10:30 company time;
 * inside that window each person is matched to their own start time. One
 * message per person per working day.
 */
export async function runCheckInNudge(nowInput) {
  const now = nowInput || new Date();
  const today = dayKey(now);
  const nowHhmm = timeKey(now);

  if (!isCheckInNudgeRunOpen(nowHhmm)) {
    return {
      sent: false,
      reason: `outside the ${CHECK_IN_NUDGE_RUN_START}–${CHECK_IN_NUDGE_RUN_END} window`,
      nudged: 0,
    };
  }

  const settings = await getSettings();
  const holidays = await holidayKeySet(today, today);
  const working = isWorkingDay(today, settings.workingDays, new Set(holidays.keys()));

  if (!working) {
    return {
      sent: false,
      reason: holidays.get(today) ? `holiday: ${holidays.get(today)}` : 'not a working day',
      nudged: 0,
    };
  }

  const date = dayDate(today);
  const [people, attendance, leave] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, slackUserId: true, checkInBy: true, lastCheckInNudgeOn: true },
    }),
    prisma.attendance.findMany({
      where: { date, checkInAt: { not: null } },
      select: { userId: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
      select: { userId: true },
    }),
  ]);

  const checkedIn = new Set(attendance.map((a) => a.userId));
  const onLeave = new Set(leave.map((l) => l.userId));

  const due = people.filter((person) =>
    shouldNudgePerson({
      workingDay: true,
      onLeave: onLeave.has(person.id),
      alreadyCheckedIn: checkedIn.has(person.id),
      alreadyNudgedToday: person.lastCheckInNudgeOn
        ? person.lastCheckInNudgeOn.toISOString().slice(0, 10) === today
        : false,
      nowHhmm,
      deadlineHhmm: checkInDeadline(person, settings),
    }),
  );

  if (due.length === 0) return { sent: false, reason: 'nobody in the 15-minute window', nudged: 0 };

  let sent = 0;
  for (const person of due) {
    const deadline = checkInDeadline(person, settings);
    const result = await sendDirectMessage(
      'checkInSoon',
      person,
      checkInSoonDm(formatClock(deadline), CHECK_IN_NUDGE_LEAD_MINUTES),
      settings,
    );
    if (result.sent) sent += 1;
    await prisma.user.update({
      where: { id: person.id },
      data: { lastCheckInNudgeOn: date },
    });
  }

  return { sent: sent > 0, nudged: due.length, delivered: sent };
}
