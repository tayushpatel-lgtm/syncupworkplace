import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return <LoginForm />;
}
