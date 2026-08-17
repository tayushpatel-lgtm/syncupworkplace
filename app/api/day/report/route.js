import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { getSettings } from '../../../../lib/settings';
import { reconcileSessions, dayTotals, checkOut, setPointDone, sendCheckOutNotice } from '../../../../lib/day';
import { dayKey, dayDate } from '../../../../lib/dates';

export async function POST(request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const { summary, closeDay, doneIds } = await request.json().catch(() => ({}));
  const settings = await getSettings();
  const text = String(summary || '').trim();

  if (settings.reportRequired && !text) {
    return Response.json({ error: 'The report is required to close the day.' }, { status: 400 });
  }

  const key = dayKey();
  await reconcileSessions(user.id, settings);

  // The check-out popup submits the final tick state for every point in one go.
  if (Array.isArray(doneIds)) {
    const keep = new Set(doneIds.map(String));
    const points = await prisma.planPoint.findMany({
      where: { userId: user.id, date: dayDate(key), dismissed: false },
      select: { id: true, done: true },
    });
    for (const point of points) {
      const shouldBeDone = keep.has(point.id);
      if (shouldBeDone !== point.done) await setPointDone(user.id, point.id, shouldBeDone);
    }
  }

  const totals = await dayTotals(user.id, key);

  const [pointsTotal, pointsDone, tasksCompleted] = await Promise.all([
    prisma.planPoint.count({ where: { userId: user.id, date: dayDate(key), dismissed: false } }),
    prisma.planPoint.count({
      where: { userId: user.id, date: dayDate(key), dismissed: false, done: true },
    }),
    prisma.task.count({
      where: {
        assigneeId: user.id,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(`${key}T00:00:00.000Z`),
          lt: new Date(`${key}T23:59:59.999Z`),
        },
      },
    }),
  ]);

  // The figures are frozen at filing time, so the report reads the same a year later.
  const frozen = {
    minutesWorked: totals.work,
    minutesBreak: totals.break,
    minutesIdle: totals.idle,
    pointsDone,
    pointsTotal,
    tasksCompleted,
  };

  await prisma.dailyReport.upsert({
    where: { userId_date: { userId: user.id, date: dayDate(key) } },
    create: { userId: user.id, date: dayDate(key), summary: text, ...frozen },
    update: { summary: text, submittedAt: new Date(), ...frozen },
  });

  if (closeDay) {
    await checkOut(user, key);
    await sendCheckOutNotice(user, key, text);
  }

  return Response.json({ ok: true });
}
