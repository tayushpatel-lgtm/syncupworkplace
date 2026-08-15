import { redirect } from 'next/navigation';
import { requireUser, onboardingPending } from '../../lib/auth';
import { prisma } from '../../lib/db';
import OnboardingChecklist from './OnboardingChecklist';

export const dynamic = 'force-dynamic';

/**
 * The gate. While the checklist is enforced and unfinished, this is the only
 * screen anyone reaches — including people who joined years ago.
 */
export default async function OnboardingPage() {
  const user = await requireUser({ skipOnboardingGate: true });
  if (!(await onboardingPending(user))) redirect('/');

  const [steps, done] = await Promise.all([
    prisma.onboardingStep.findMany({ orderBy: { order: 'asc' } }),
    prisma.onboardingProgress.findMany({ where: { userId: user.id }, select: { stepId: true } }),
  ]);

  return (
    <OnboardingChecklist
      name={user.name}
      steps={steps}
      doneIds={done.map((d) => d.stepId)}
    />
  );
}
