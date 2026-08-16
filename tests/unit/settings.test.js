import { describe, it, expect } from 'vitest';
import { checkInDeadline, presentThresholdMinutes } from '../../lib/settings.js';

describe('checkInDeadline', () => {
  it('uses the company default when the person has no override', () => {
    expect(checkInDeadline({ checkInBy: null }, { defaultCheckInBy: '09:30' })).toBe('09:30');
  });

  it('uses the personal override when set', () => {
    expect(checkInDeadline({ checkInBy: '10:00' }, { defaultCheckInBy: '09:30' })).toBe('10:00');
  });
});

describe('presentThresholdMinutes', () => {
  it('uses the company default when the person has no override', () => {
    expect(presentThresholdMinutes({ minPresentMinutes: null }, { minPresentMinutes: 240 })).toBe(240);
  });

  it('uses the personal override when set, even to zero', () => {
    expect(presentThresholdMinutes({ minPresentMinutes: 0 }, { minPresentMinutes: 240 })).toBe(0);
  });

  it('uses the personal override for a normal positive value', () => {
    expect(presentThresholdMinutes({ minPresentMinutes: 300 }, { minPresentMinutes: 240 })).toBe(300);
  });
});
