import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { readSession, sessionCookie } from './session';
import { getSettings } from './settings';

export const ADMIN_ROLES = ['ADMIN', 'CEO'];

export function isAdmin(user) {
  return !!user && ADMIN_ROLES.includes(user.role);
}

/** The signed-in user, or null. Never throws — callers decide what to do. */
export async function currentUser() {
  const jar = await cookies();
  const payload = await readSession(jar.get(sessionCookie.name)?.value);
  if (!payload?.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      title: true,
      checkInBy: true,
      minPresentMinutes: true,
      active: true,
      joinedAt: true,
    },
  });
  if (!user || !user.active) return null;
  return user;
}

/** Whether this person still has onboarding steps to tick, when it is enforced. */
export async function onboardingPending(user) {
  const settings = await getSettings();
  if (!settings.onboardingEnforced) return false;

  const [steps, done] = await Promise.all([
    prisma.onboardingStep.count(),
    prisma.onboardingProgress.count({ where: { userId: user.id } }),
  ]);
  return steps > 0 && done < steps;
}

/** For pages: sends people to login, and through onboarding before anything else. */
export async function requireUser({ skipOnboardingGate = false } = {}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!skipOnboardingGate && (await onboardingPending(user))) redirect('/onboarding');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect('/');
  return user;
}

/** For route handlers: returns a user or a 401/403 Response, never redirects. */
export async function apiUser({ admin = false } = {}) {
  const user = await currentUser();
  if (!user) {
    return { user: null, error: Response.json({ error: 'Not signed in' }, { status: 401 }) };
  }
  if (admin && !isAdmin(user)) {
    return { user: null, error: Response.json({ error: 'Admins only' }, { status: 403 }) };
  }
  return { user, error: null };
}
