import { describe, it, expect } from 'vitest';
import { canAccessPassword, canManagePassword, passwordWhereForUser } from '../../lib/passwords.js';

const creator = { id: 'u-creator', department: 'Engineering' };
const stranger = { id: 'u-stranger', department: 'Sales' };
const sameDept = { id: 'u-samedept', department: 'Engineering' };
const shared = { id: 'u-shared', department: 'Sales' };

function entry(overrides) {
  return {
    createdById: creator.id,
    visibility: 'PEOPLE',
    department: null,
    shares: [],
    ...overrides,
  };
}

describe('canAccessPassword', () => {
  it('always lets the creator in, regardless of visibility', () => {
    expect(canAccessPassword(entry({ visibility: 'PEOPLE' }), creator, false)).toBe(true);
  });

  it('lets anyone in for COMPANY visibility', () => {
    expect(canAccessPassword(entry({ visibility: 'COMPANY' }), stranger, false)).toBe(true);
  });

  it('blocks a PEOPLE entry from someone not on the share list', () => {
    expect(canAccessPassword(entry({ visibility: 'PEOPLE', shares: [] }), stranger, false)).toBe(false);
  });

  it('lets in someone explicitly shared with, even outside the department', () => {
    const e = entry({ visibility: 'PEOPLE', shares: [{ userId: shared.id }] });
    expect(canAccessPassword(e, shared, false)).toBe(true);
  });

  it('lets in the same department for DEPARTMENT visibility', () => {
    const e = entry({ visibility: 'DEPARTMENT', department: 'Engineering' });
    expect(canAccessPassword(e, sameDept, false)).toBe(true);
  });

  it('blocks a different department for DEPARTMENT visibility', () => {
    const e = entry({ visibility: 'DEPARTMENT', department: 'Engineering' });
    expect(canAccessPassword(e, stranger, false)).toBe(false);
  });

  it('an admin sees everything regardless of visibility', () => {
    expect(canAccessPassword(entry({ visibility: 'PEOPLE', shares: [] }), stranger, true)).toBe(true);
  });
});

describe('canManagePassword', () => {
  it('lets the creator manage it', () => {
    expect(canManagePassword(entry({}), creator, false)).toBe(true);
  });

  it('blocks a non-creator, non-admin', () => {
    expect(canManagePassword(entry({}), stranger, false)).toBe(false);
  });

  it('lets an admin manage anyone else\'s entry', () => {
    expect(canManagePassword(entry({}), stranger, true)).toBe(true);
  });
});

describe('passwordWhereForUser', () => {
  it('builds an OR clause covering company-wide, department, ownership and shares', () => {
    const where = passwordWhereForUser({ id: 'u1', department: 'Design' });
    expect(where.OR).toContainEqual({ visibility: 'COMPANY' });
    expect(where.OR).toContainEqual({ visibility: 'DEPARTMENT', department: 'Design' });
    expect(where.OR).toContainEqual({ createdById: 'u1' });
    expect(where.OR).toContainEqual({ shares: { some: { userId: 'u1' } } });
  });

  it('falls back to an unmatchable department sentinel when the user has none', () => {
    const where = passwordWhereForUser({ id: 'u1', department: null });
    expect(where.OR).toContainEqual({ visibility: 'DEPARTMENT', department: '__none__' });
  });
});
