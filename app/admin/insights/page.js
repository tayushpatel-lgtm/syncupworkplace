import { requireAdmin } from '../../../lib/auth';
import { buildInsights } from '../../../lib/insights';
import { formatHours } from '../../../lib/dates';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import InsightsView from './InsightsView';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 60, 90];

export default async function InsightsPage({ searchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const days = RANGES.includes(Number(params?.range)) ? Number(params.range) : 30;

  const data = await buildInsights(days);

  return (
    <Shell user={user}>
      <PageHead
        title="Insights"
        subtitle={`Rolling ${days} days · ${data.workingDayCount} working days. Hours are recorded work time only.`}
      />
      <InsightsView
        days={days}
        ranges={RANGES}
        data={{
          ...data,
          settings: undefined,
          holidayKeys: undefined,
          people: undefined,
          averagePerPersonLabel: formatHours(data.averagePerPerson),
          averageWorkedDayLabel: formatHours(data.averageWorkedDay),
        }}
      />
    </Shell>
  );
}
