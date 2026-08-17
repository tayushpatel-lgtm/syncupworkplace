import { describe, it, expect } from 'vitest';
import {
  dayKey,
  dayDate,
  shiftDay,
  weekday,
  isWorkingDay,
  rangeKeys,
  lastNDays,
  previousWorkingDay,
  minutesOfDay,
  formatClock,
  formatDuration,
  formatHours,
  zonedTimeToUtc,
  timeKey,
} from '../../lib/dates.js';

describe('dayKey / dayDate', () => {
  it('round-trips a key through dayDate back to the same key', () => {
    expect(dayKey(dayDate('2026-03-14'))).toBe('2026-03-14');
  });
});

describe('shiftDay', () => {
  it('moves forward and backward within a month', () => {
    expect(shiftDay('2026-08-15', 1)).toBe('2026-08-16');
    expect(shiftDay('2026-08-15', -1)).toBe('2026-08-14');
  });

  it('crosses a month boundary', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses a year boundary', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles February in a leap year', () => {
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01'); // 2026 is not a leap year
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is
  });
});

describe('weekday', () => {
  it('reads Monday as 1 and Sunday as 7, not JS-native 0', () => {
    expect(weekday('2026-08-17')).toBe(1); // a Monday
    expect(weekday('2026-08-16')).toBe(7); // a Sunday
  });
});

describe('isWorkingDay', () => {
  const workingDays = [1, 2, 3, 4, 5, 6]; // Mon-Sat

  it('is true for a plain Tuesday', () => {
    expect(isWorkingDay('2026-08-18', workingDays)).toBe(true);
  });

  it('is false for Sunday, which is outside the working week', () => {
    expect(isWorkingDay('2026-08-16', workingDays)).toBe(false);
  });

  it('is false for a holiday even on an otherwise-working day', () => {
    const holidays = new Set(['2026-08-18']);
    expect(isWorkingDay('2026-08-18', workingDays, holidays)).toBe(false);
  });
});

describe('rangeKeys', () => {
  it('is inclusive of both ends', () => {
    expect(rangeKeys('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('returns empty for an inverted range rather than looping forever', () => {
    expect(rangeKeys('2026-08-05', '2026-08-01')).toEqual([]);
  });

  it('handles a single-day range', () => {
    expect(rangeKeys('2026-08-01', '2026-08-01')).toEqual(['2026-08-01']);
  });
});

describe('lastNDays', () => {
  it('returns n days ending on the given key, oldest first', () => {
    expect(lastNDays(3, '2026-08-15')).toEqual(['2026-08-13', '2026-08-14', '2026-08-15']);
  });
});

describe('previousWorkingDay', () => {
  const workingDays = [1, 2, 3, 4, 5, 6]; // Sunday off

  it('steps back one day when yesterday was a working day', () => {
    // 2026-08-18 is a Tuesday; Monday the 17th is a working day.
    expect(previousWorkingDay('2026-08-18', workingDays)).toBe('2026-08-17');
  });

  it('skips over a non-working Sunday', () => {
    // 2026-08-17 is a Monday; Sunday the 16th is off, so it should land on
    // Saturday the 15th.
    expect(previousWorkingDay('2026-08-17', workingDays)).toBe('2026-08-15');
  });

  it('skips a holiday that falls on an otherwise-working day', () => {
    const holidays = new Set(['2026-08-17']); // Monday declared a holiday
    expect(previousWorkingDay('2026-08-18', workingDays, holidays)).toBe('2026-08-15');
  });

  it('gives up and returns null past the lookback window', () => {
    expect(previousWorkingDay('2026-08-18', [], new Set(), 5)).toBeNull();
  });
});

describe('minutesOfDay', () => {
  it('reads HH:MM as minutes past midnight', () => {
    expect(minutesOfDay('09:30')).toBe(570);
    expect(minutesOfDay('00:00')).toBe(0);
    expect(minutesOfDay('23:59')).toBe(1439);
  });
});

describe('formatClock', () => {
  it('renders morning and afternoon correctly', () => {
    expect(formatClock('09:30')).toBe('09:30 AM');
    expect(formatClock('13:05')).toBe('01:05 PM');
  });

  it('handles the midnight and noon edge cases', () => {
    expect(formatClock('00:00')).toBe('12:00 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
  });
});

describe('zonedTimeToUtc', () => {
  it('converts a company-timezone wall clock time to the matching UTC instant', () => {
    // Asia/Kolkata is UTC+5:30 year round, no DST to worry about.
    expect(zonedTimeToUtc('2026-08-17', '09:30').toISOString()).toBe('2026-08-17T04:00:00.000Z');
    expect(zonedTimeToUtc('2026-08-17', '23:45').toISOString()).toBe('2026-08-17T18:15:00.000Z');
  });

  it('round-trips through timeKey back to the same wall clock time', () => {
    const instant = zonedTimeToUtc('2026-08-17', '14:07');
    expect(timeKey(instant)).toBe('14:07');
  });
});

describe('formatDuration', () => {
  it('shows only hours when the remainder is zero', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('shows only minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('shows both when neither is zero', () => {
    expect(formatDuration(125)).toBe('2h 5m');
  });

  it('floors a negative input at zero rather than going negative', () => {
    expect(formatDuration(-30)).toBe('0m');
  });
});

describe('formatHours', () => {
  it('shows one decimal place under 100 hours', () => {
    expect(formatHours(185)).toBe('3.1h'); // 185 minutes ≈ 3.08h
  });

  it('rounds to a whole number at 100 hours and above', () => {
    expect(formatHours(100 * 60)).toBe('100h');
    expect(formatHours(101 * 60 + 40)).toBe('102h');
  });
});
