import { requireUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import Shell from '../../components/Shell';
import AppLink from '../../components/AppLink';
import { PageHead, Card, Empty } from '../../components/ui';
import { Icon } from '../../components/Icons';

export const dynamic = 'force-dynamic';

export default async function AppsPage() {
  const user = await requireUser();

  const apps = await prisma.app.findMany({
    where: {
      OR: [{ department: null }, { department: user.department || '__none__' }],
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });

  return (
    <Shell user={user}>
      <PageHead
        title="Apps"
        subtitle={user.department ? `Company-wide, plus ${user.department}` : 'Company-wide'}
      />

      <div className="grid-3" style={{ gap: 18 }}>
        <AppLink href="/apps/passwords" className="card" style={{ display: 'block' }}>
          <div className="row" style={{ gap: 14 }}>
            <span className="glyph" style={{ fontSize: 18 }}>
              <Icon.key width={20} height={20} />
            </span>
            <div>
              <b style={{ display: 'block', fontSize: 15.5 }}>Password</b>
              <small className="muted" style={{ fontSize: 13 }}>Shared credentials, encrypted</small>
            </div>
          </div>
        </AppLink>

        {apps.map((app) => (
          <AppLink
            key={app.id}
            href={app.url || '#'}
            external={!!app.url && !app.url.startsWith('/')}
            className="card"
            style={{ display: 'block', cursor: app.url ? 'pointer' : 'default' }}
          >
            <div className="row" style={{ gap: 14 }}>
              <span className="glyph" style={{ fontSize: 18 }}>
                {app.icon}
              </span>
              <div>
                <b style={{ display: 'block', fontSize: 15.5 }}>{app.name}</b>
                <small className="muted" style={{ fontSize: 13 }}>
                  {app.description || (app.department ? app.department : 'Company-wide')}
                </small>
              </div>
            </div>
          </AppLink>
        ))}
      </div>

      {apps.length === 0 && (
        <Card>
          <Empty>
            Nothing added for {user.department || 'the company'} yet. An admin can add shortcuts from
            Settings.
          </Empty>
        </Card>
      )}
    </Shell>
  );
}
