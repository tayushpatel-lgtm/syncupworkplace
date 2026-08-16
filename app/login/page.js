import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

/** Only ever redirect somewhere inside this app — never let a query param send someone off-site. */
function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNext(params?.next);
  if (await currentUser()) redirect(next);
  return <LoginForm next={next} />;
}
