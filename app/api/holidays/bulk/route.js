import { prisma } from '../../../../lib/db';
import { apiUser } from '../../../../lib/auth';
import { parseHolidayLines } from '../../../../lib/holidays';

export async function POST(request) {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const year = Number(body.year);
  const text = String(body.text || '');

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: 'That year does not look right.' }, { status: 400 });
  }
  if (!text.trim()) {
    return Response.json({ error: 'Paste the holiday list first.' }, { status: 400 });
  }

  const { found, skipped } = parseHolidayLines(text, year);
  if (found.length === 0) {
    return Response.json({ error: "Couldn't read a single holiday out of that." }, { status: 400 });
  }

  for (const { date, name } of found) {
    await prisma.holiday.upsert({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      create: { date: new Date(`${date}T00:00:00.000Z`), name },
      update: { name },
    });
  }

  return Response.json({ ok: true, added: found.length, skipped });
}
