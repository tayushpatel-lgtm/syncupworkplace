import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import Shell from '../../../components/Shell';
import { PageHead } from '../../../components/ui';
import PasswordDirectory from './PasswordDirectory';

export const dynamic = 'force-dynamic';

export default async function PasswordDirectoryPage() {
  const user = await requireAdmin();

  const [entries, people, settings] = await Promise.all([
    prisma.passwordEntry.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
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
        title="Passwords"
        subtitle={`${entries.length} shared credential${entries.length === 1 ? '' : 's'} on file — every entry, whoever added it.`}
      />
      <PasswordDirectory
        entries={entries.map((e) => ({
          id: e.id,
          title: e.title,
          username: e.username,
          url: e.url,
          notes: e.notes,
          visibility: e.visibility,
          department: e.department,
          createdByName: e.createdBy.name,
          sharedWith: e.shares.map((s) => s.userId),
        }))}
        people={people}
        departments={departments}
      />
    </Shell>
  );
}
