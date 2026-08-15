import { prisma } from '../lib/db';
import { isAdmin } from '../lib/auth';
import Nav from './Nav';

/** The fixed left rail plus the page beside it. Every signed-in screen uses this. */
export default async function Shell({ user, children }) {
  const pendingLeave = isAdmin(user)
    ? await prisma.leaveRequest.count({ where: { status: 'PENDING' } })
    : 0;

  return (
    <div className="app-shell">
      <Nav user={user} pendingLeave={pendingLeave} />
      <main className="main">{children}</main>
    </div>
  );
}
