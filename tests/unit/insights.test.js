import { describe, it, expect } from 'vitest';
import { rampColor, MAGNITUDE_RAMP } from '../../lib/insights.js';

describe('rampColor', () => {
  it('returns the line colour for zero or negative values', () => {
    expect(rampColor(0, 100)).toBe('var(--line)');
    expect(rampColor(-5, 100)).toBe('var(--line)');
  });

  it('returns the line colour when max is zero (nothing to scale against)', () => {
    expect(rampColor(5, 0)).toBe('var(--line)');
  });

  it('puts the maximum value on the darkest step', () => {
    expect(rampColor(100, 100)).toBe(MAGNITUDE_RAMP[MAGNITUDE_RAMP.length - 1]);
  });

  it('never returns a step outside the ramp, even at the exact minimum', () => {
    const color = rampColor(10, 100, 10);
    expect(MAGNITUDE_RAMP).toContain(color);
  });

  it('spreads across the ramp instead of collapsing to one shade when min equals max', () => {
    // A month of identical-looking days would otherwise paint every bar the
    // same colour and say nothing — the function should still return a real step.
    const color = rampColor(50, 50, 50);
    expect(MAGNITUDE_RAMP).toContain(color);
  });

  it('is monotone — a larger value never gets an earlier step than a smaller one', () => {
    const low = MAGNITUDE_RAMP.indexOf(rampColor(20, 100, 0));
    const mid = MAGNITUDE_RAMP.indexOf(rampColor(50, 100, 0));
    const high = MAGNITUDE_RAMP.indexOf(rampColor(90, 100, 0));
    expect(low).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(high);
  });
});
