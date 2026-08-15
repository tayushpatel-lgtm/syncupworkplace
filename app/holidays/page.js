import { requireUser, isAdmin } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { dayKey } from '../../lib/dates';
import Shell from '../../components/Shell';
import { PageHead, Card, Empty } from '../../components/ui';
import HolidayAdmin from './HolidayAdmin';

export const dynamic = 'force-dynamic';

export default async function HolidaysPage() {
  const user = await requireUser();
  const today = dayKey();
  const year = Number(today.slice(0, 4));

  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lte: new Date(`${year}-12-31T00:00:00.000Z`),
      },
    },
    orderBy: { date: 'asc' },
  });

  const rows = holidays.map((h) => {
    const key = h.date.toISOString().slice(0, 10);
    return {
      id: h.id,
      key,
      name: h.name,
      past: key < today,
      weekday: new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        weekday: 'long',
      }),
      label: new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
      }),
    };
  });

  const upcoming = rows.filter((r) => !r.past);

  return (
    <Shell user={user}>
      <PageHead
        title="Holidays"
        subtitle={`${year} · ${rows.length} in the calendar, ${upcoming.length} still to come`}
      />

      <Card>
        {rows.length === 0 && <Empty>No holidays in the calendar for {year}.</Empty>}
        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>DAY</th>
                <th>HOLIDAY</th>
                <th className="right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={row.past ? { opacity: 0.45 } : undefined}>
                  <td className="num">{row.label}</td>
                  <td className="muted">{row.weekday}</td>
                  <td>{row.name}</td>
                  <td className="right">
                    <span className={`chip ${row.past ? '' : 'green'}`}>
                      {row.past ? 'passed' : 'upcoming'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {isAdmin(user) && <HolidayAdmin />}
    </Shell>
  );
}
