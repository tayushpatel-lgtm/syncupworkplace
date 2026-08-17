import { prisma } from '../../../../../lib/db';
import { apiUser } from '../../../../../lib/auth';

/**
 * Wipes every task company-wide — attachments cascade with them, and any
 * plan point that came from a task survives as a plain point (its taskId
 * just goes null), the same way it would if the task were deleted one at a
 * time. Nothing else about a person's day is touched.
 */
export async function POST() {
  const { error } = await apiUser({ admin: true });
  if (error) return error;

  const { count } = await prisma.task.deleteMany({});
  return Response.json({ ok: true, deleted: count });
}
