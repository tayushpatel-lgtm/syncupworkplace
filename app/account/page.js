import { requireUser } from '../../lib/auth';
import Shell from '../../components/Shell';
import AccountForm from './AccountForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <Shell user={user}>
      <AccountForm
        name={user.name}
        email={user.email}
        role={user.role}
        department={user.department}
        slackUserId={user.slackUserId || ''}
      />
    </Shell>
  );
}
