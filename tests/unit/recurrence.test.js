import { describe, it, expect } from 'vitest';
import {
  nextDueDate,
  repeatLabel,
  belongsOnTodayPlan,
  parseRepeatInput,
  parseRepeat,
} from '../../lib/recurrence.js';

function d(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymd(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

describe('nextDueDate', () => {
  it('does not advance a one-off', () => {
    expect(nextDueDate(d('2026-08-24'), 'NONE')).toBeNull();
  });

  it('daily is the next calendar day', () => {
    expect(ymd(nextDueDate(d('2026-08-24'), 'DAILY'))).toBe('2026-08-25');
  });

  it('weekdays run Monday to Saturday and skip Sunday', () => {
    expect(ymd(nextDueDate(d('2026-08-21'), 'WEEKDAYS'))).toBe('2026-08-22'); // Fri → Sat
    expect(ymd(nextDueDate(d('2026-08-22'), 'WEEKDAYS'))).toBe('2026-08-24'); // Sat → Mon
    expect(ymd(nextDueDate(d('2026-08-23'), 'WEEKDAYS'))).toBe('2026-08-24'); // Sun → Mon
    expect(ymd(nextDueDate(d('2026-08-24'), 'WEEKDAYS'))).toBe('2026-08-25'); // Mon → Tue
  });

  it('weekly lands on the next matching weekday', () => {
    expect(ymd(nextDueDate(d('2026-08-24'), 'WEEKLY', { weekdays: [1] }))).toBe('2026-08-31');
    expect(ymd(nextDueDate(d('2026-08-24'), 'WEEKLY', { weekdays: [1, 3] }))).toBe('2026-08-26');
  });

  it('weekly with an interval of 2 skips a week after the last day in the current week', () => {
    expect(ymd(nextDueDate(d('2026-08-24'), 'WEEKLY', { weekdays: [1, 3], interval: 2 }))).toBe('2026-08-26');
    expect(ymd(nextDueDate(d('2026-08-26'), 'WEEKLY', { weekdays: [1, 3], interval: 2 }))).toBe('2026-09-07');
  });

  it('daily with an interval of 2 skips a day', () => {
    expect(ymd(nextDueDate(d('2026-08-24'), 'DAILY', { interval: 2 }))).toBe('2026-08-26');
  });

  it('monthly clamps a long month onto the last day of a short one', () => {
    expect(ymd(nextDueDate(d('2026-01-31'), 'MONTHLY'))).toBe('2026-02-28');
    expect(ymd(nextDueDate(d('2026-08-24'), 'MONTHLY'))).toBe('2026-09-24');
  });

  it('yearly keeps the same month and day', () => {
    expect(ymd(nextDueDate(d('2026-08-24'), 'YEARLY'))).toBe('2027-08-24');
  });

  it('stops when the next due would pass the end date', () => {
    expect(nextDueDate(d('2026-08-24'), 'DAILY', { until: d('2026-08-24') })).toBeNull();
    expect(ymd(nextDueDate(d('2026-08-24'), 'DAILY', { until: d('2026-08-25') }))).toBe('2026-08-25');
  });
});

describe('belongsOnTodayPlan', () => {
  it('keeps one-off open tasks on the plan even if they are due later', () => {
    expect(belongsOnTodayPlan({ repeat: 'NONE', dueDate: d('2026-12-01') }, '2026-08-24')).toBe(true);
  });

  it('holds a repeating task off the plan until its due day', () => {
    expect(belongsOnTodayPlan({ repeat: 'DAILY', dueDate: d('2026-12-01') }, '2026-08-24')).toBe(false);
    expect(belongsOnTodayPlan({ repeat: 'DAILY', dueDate: d('2026-08-24') }, '2026-08-24')).toBe(true);
    expect(belongsOnTodayPlan({ repeat: 'DAILY', dueDate: d('2026-08-20') }, '2026-08-24')).toBe(true);
  });
});

describe('repeatLabel', () => {
  it('returns null for a one-off', () => {
    expect(repeatLabel({ repeat: 'NONE' })).toBeNull();
  });

  it('names the Google Calendar-style presets', () => {
    expect(repeatLabel({ repeat: 'DAILY' })).toBe('Daily');
    expect(repeatLabel({ repeat: 'WEEKDAYS' })).toBe('Every weekday (Monday to Saturday)');
    expect(repeatLabel({ repeat: 'WEEKLY', repeatWeekdays: [1] })).toBe('Weekly on Monday');
    expect(repeatLabel({ repeat: 'MONTHLY', dueDate: d('2026-08-24') })).toBe('Monthly');
    expect(repeatLabel({ repeat: 'YEARLY', dueDate: d('2026-08-24') })).toBe('Annually on August 24');
  });
});

describe('parseRepeatInput', () => {
  it('defaults an unknown value to a one-off', () => {
    expect(parseRepeat('custom')).toBe('NONE');
  });

  it('fills in today when a repeating task has no first due date', () => {
    const parsed = parseRepeatInput({ repeat: 'DAILY' }, { todayKey: '2026-08-24' });
    expect(parsed.repeat).toBe('DAILY');
    expect(ymd(parsed.dueDate)).toBe('2026-08-24');
  });

  it('picks the deadline weekday when weekly days are omitted', () => {
    const parsed = parseRepeatInput({ repeat: 'WEEKLY', dueDate: '2026-08-24' });
    expect(parsed.repeatWeekdays).toEqual([1]);
  });
});
