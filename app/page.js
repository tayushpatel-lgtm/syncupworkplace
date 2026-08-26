import { requireUser } from '../lib/auth';
import { prisma } from '../lib/db';
import { getSettings, checkInDeadline, holidayKeySet } from '../lib/settings';
import { reconcileSessions, dayTotals, getAttendance, getPlan, buildPlan } from '../lib/day';
import { dayKey, dayDate, formatDayLabel, isWorkingDay, formatClock, TZ, timeKey, minutesOfDay } from '../lib/dates';
import Shell from '../components/Shell';
import MyDay from './MyDay';

export const dynamic = 'force-dynamic';

export default async function MyDayPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const key = dayKey();

  // Any timer left running is settled before we read a single number.
  await reconcileSessions(user.id, settings);

  const attendance = await getAttendance(user.id, key);
  // Someone who checked in earlier gets the plan refreshed, so tasks assigned
  // during the day still land on it.
  if (attendance?.checkInAt) await buildPlan(user, key, settings);

  const holidays = await holidayKeySet(key, key);
  const deadline = checkInDeadline(user, settings);
  const [plan, totals, report, openTaskGroups] = await Promise.all([
    getPlan(user.id, key),
    dayTotals(user.id, key),
    prisma.dailyReport.findUnique({ where: { userId_date: { userId: user.id, date: dayDate(key) } } }),
    prisma.task.groupBy({
      by: ['priority'],
      where: { assigneeId: user.id, status: { in: ['PENDING', 'PROGRESS'] } },
      _count: { _all: true },
    }),
  ]);

  const openTaskPriorities = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const row of openTaskGroups) openTaskPriorities[row.priority] = row._count._all;

  return (
    <Shell user={user}>
      <MyDay
        user={user}
        dayKey={key}
        dayLabel={formatDayLabel(key, { weekday: 'long', year: 'numeric' })}
        timezone={TZ}
        workingDay={isWorkingDay(key, settings.workingDays, new Set(holidays.keys()))}
        holidayName={holidays.get(key) || null}
        deadline={deadline}
        deadlineLabel={formatClock(deadline)}
        lateByMinutes={Math.max(0, minutesOfDay(timeKey()) - minutesOfDay(deadline))}
        reportRequired={settings.reportRequired}
        checkedIn={!!attendance?.checkInAt || !!totals.running}
        checkedOut={!!attendance?.checkOutAt}
        late={!!attendance?.late}
        checkInAt={attendance?.checkInAt ? attendance.checkInAt.toISOString() : null}
        plan={plan.map((p) => ({
          id: p.id,
          title: p.title,
          done: p.done,
          taskId: p.taskId,
          priority: p.task?.priority || null,
          carried: p.originDate ? p.originDate.toISOString().slice(0, 10) !== key : false,
        }))}
        totals={totals}
        running={
          totals.running
            ? { kind: totals.running.kind, startedAt: totals.running.startedAt.toISOString() }
            : null
        }
        report={report ? { summary: report.summary, submittedAt: report.submittedAt.toISOString() } : null}
        openTaskPriorities={openTaskPriorities}
      />
    </Shell>
  );
}
