import { describe, it, expect } from 'vitest';
import { shouldNudgePerson } from '../../lib/check-in-nudge.js';
import { checkInNudgeClock, isInCheckInNudgeWindow, clockFromMinutes } from '../../lib/dates.js';

describe('check-in nudge window', () => {
  it('fires 15 minutes before a 09:30 start — at 09:15, not 09:30', () => {
    expect(checkInNudgeClock('09:30')).toBe('09:15');
    expect(isInCheckInNudgeWindow('09:15', '09:30')).toBe(true);
    expect(isInCheckInNudgeWindow('09:30', '09:30')).toBe(false);
    expect(isInCheckInNudgeWindow('09:00', '09:30')).toBe(false);
  });

  it('fires 15 minutes before a 10:00 start — at 09:45', () => {
    expect(checkInNudgeClock('10:00')).toBe('09:45');
    expect(isInCheckInNudgeWindow('09:45', '10:00')).toBe(true);
    expect(isInCheckInNudgeWindow('09:15', '10:00')).toBe(false);
    expect(isInCheckInNudgeWindow('10:00', '10:00')).toBe(false);
  });

  it('does not wrap before midnight for a very early deadline', () => {
    expect(checkInNudgeClock('00:10')).toBeNull();
    expect(isInCheckInNudgeWindow('23:55', '00:10')).toBe(false);
    expect(clockFromMinutes(-1)).toBeNull();
  });
});

describe('shouldNudgePerson', () => {
  const due = {
    workingDay: true,
    onLeave: false,
    alreadyCheckedIn: false,
    alreadyNudgedToday: false,
    nowHhmm: '09:15',
    deadlineHhmm: '09:30',
  };

  it('sends when it is 15 minutes before their start on a working day', () => {
    expect(shouldNudgePerson(due)).toBe(true);
  });

  it('skips weekends, leave, people already in, and a second pass the same day', () => {
    expect(shouldNudgePerson({ ...due, workingDay: false })).toBe(false);
    expect(shouldNudgePerson({ ...due, onLeave: true })).toBe(false);
    expect(shouldNudgePerson({ ...due, alreadyCheckedIn: true })).toBe(false);
    expect(shouldNudgePerson({ ...due, alreadyNudgedToday: true })).toBe(false);
  });

  it('does not send a 09:30 person at 09:45 (that slot is for 10:00 people)', () => {
    expect(shouldNudgePerson({ ...due, nowHhmm: '09:45' })).toBe(false);
    expect(shouldNudgePerson({ ...due, nowHhmm: '09:45', deadlineHhmm: '10:00' })).toBe(true);
  });
});
