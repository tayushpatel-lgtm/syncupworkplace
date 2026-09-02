import { prisma } from '../lib/db';
import { isAdmin } from '../lib/auth';
import { dayTotals } from '../lib/day';
import { dayKey } from '../lib/dates';
import Nav from './Nav';
import SessionPulse from './SessionPulse';
import UnloadGuard from './UnloadGuard';
import WorkTitle from './WorkTitle';

/** The fixed left rail plus the page beside it. Every signed-in screen uses this. */
export default async function Shell({ user, children }) {
  const [pendingLeave, totals] = await Promise.all([
    isAdmin(user) ? prisma.leaveRequest.count({ where: { status: 'PENDING' } }) : 0,
    dayTotals(user.id, dayKey()),
  ]);

  const running = totals.running
    ? { kind: totals.running.kind, startedAt: totals.running.startedAt.toISOString() }
    : null;

  return (
    <SessionPulse running={running}>
      <div className="app-shell">
        <UnloadGuard running={!!running} />
        <WorkTitle
          workMinutes={
            totals.work +
            (totals.priorWork || 0) +
            (totals.running?.kind === 'WORK' ? totals.liveWork || 0 : 0)
          }
          running={running}
        />
        <Nav user={user} pendingLeave={pendingLeave} />
        <main className="main">{children}</main>
      </div>
    </SessionPulse>
  );
}
