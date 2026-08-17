import { redirect } from 'next/navigation';
import { requireUser } from '../../lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

/**
 * The gate. A first login (or a password an admin just reset) lands here and
 * nowhere else until a new password is set — before onboarding, before
 * anything.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser({ skipPasswordGate: true, skipOnboardingGate: true });
  if (!user.mustChangePassword) redirect('/');

  return <ChangePasswordForm name={user.name} />;
}
