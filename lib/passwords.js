/** The Prisma filter for "entries this person is allowed to see" on the personal Password app. */
export function passwordWhereForUser(user) {
  return {
    OR: [
      { visibility: 'COMPANY' },
      { visibility: 'DEPARTMENT', department: user.department || '__none__' },
      { createdById: user.id },
      { shares: { some: { userId: user.id } } },
    ],
  };
}

/** Same rule, applied to one already-fetched entry (with its shares included). */
export function canAccessPassword(entry, user, isAdminUser) {
  if (isAdminUser) return true;
  if (entry.createdById === user.id) return true;
  if (entry.visibility === 'COMPANY') return true;
  if (entry.visibility === 'DEPARTMENT' && entry.department && entry.department === user.department) {
    return true;
  }
  return !!entry.shares?.some((s) => s.userId === user.id);
}

/** Editing the entry itself, or its sharing — the creator, or an admin. */
export function canManagePassword(entry, user, isAdminUser) {
  return isAdminUser || entry.createdById === user.id;
}
