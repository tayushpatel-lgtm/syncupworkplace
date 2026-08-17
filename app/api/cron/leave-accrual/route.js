import { prisma } from '../../../../lib/db';
import { currentUser, isAdmin } from '../../../../lib/auth';
import { nextAccrual, monthKey } from '../../../../lib/leave';
import { dayKey } from '../../../../lib/dates';
import { safeEqual } from '../../../../lib/tokens';

/**
 * One pass over everyone: credits this month's casual/sick leave if it
 * hasn't run for them yet this month. Reachable two ways — a scheduled call
 * carrying CRON_SECRET, or an admin pressing the button on the Leave page.
 * Safe to run more than once a day — lastLeaveAccrualMonth makes it a no-op
 * for anyone already done this month.
 */
async function runPass() {
  const today = dayKey();
  const people = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      employmentType: true,
      joinedAt: true,
      casualLeaveBalance: true,
      sickLeaveBalance: true,
      lastLeaveAccrualMonth: true,
    },
  });

  let accrued = 0;
  for (const person of people) {
    const next = nextAccrual(
      {
        employmentType: person.employmentType,
        joinedAtKey: dayKey(person.joinedAt),
        casualLeaveBalance: person.casualLeaveBalance,
        sickLeaveBalance: person.sickLeaveBalance,
        lastLeaveAccrualMonth: person.lastLeaveAccrualMonth,
      },
      today,
    );
    if (!next) continue;
    await prisma.user.update({ where: { id: person.id }, data: next });
    accrued += 1;
  }

  return { accrued, ofPeople: people.length, month: monthKey(today) };
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
