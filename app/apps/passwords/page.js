import { requireUser, isAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import { passwordWhereForUser } from '../../../lib/passwords';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import PasswordApp from './PasswordApp';

export const dynamic = 'force-dynamic';

export default async function PasswordAppPage() {
  const user = await requireUser();

  const [entries, people, settings] = await Promise.all([
    prisma.passwordEntry.findMany({
      where: passwordWhereForUser(user),
      include: {
        createdBy: { select: { name: true } },
        shares: { select: { userId: true } },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    }),
    getSettings(),
  ]);

  const departments = settings.departments;

  return (
    <Shell user={user}>
      <PageHead
        title="Password"
        subtitle="Shared credentials, encrypted at rest. Only what's shared with you shows up here."
      />
      <PasswordApp
        entries={entries.map((e) => ({
          id: e.id,
          title: e.title,
          username: e.username,
          url: e.url,
          notes: e.notes,
          visibility: e.visibility,
          department: e.department,
          createdByName: e.createdBy.name,
          mine: e.createdById === user.id,
          sharedWith: e.shares.map((s) => s.userId),
        }))}
        people={people}
        departments={departments}
        currentUserId={user.id}
        isAdmin={isAdmin(user)}
      />
    </Shell>
  );
}
