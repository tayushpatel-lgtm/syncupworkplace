import { describe, it, expect } from 'vitest';
import { parseHolidayLines } from '../../lib/holidays.js';

const REAL_2026_LIST = `26 Jan\tMonday\tRepublic Day\tGazetted Holiday\t
4 Mar\tWednesday\tHoli\tGazetted Holiday\t
21 Mar\tSaturday\tRamzan Id\tGazetted Holiday\t
26 Mar\tThursday\tRama Navami\tGazetted Holiday\t
31 Mar\tTuesday\tMahavir Jayanti\tGazetted Holiday\t
3 Apr\tFriday\tGood Friday\tGazetted Holiday\t
14 Apr\tTuesday\tAmbedkar Jayanti\tCentral Government Holiday\t
1 May\tFriday\tBuddha Purnima\tGazetted Holiday\t
28 May\tThursday\tBakrid\tGazetted Holiday\t
26 Jun\tFriday\tMuharram/Ashura\tGazetted Holiday\t
15 Aug\tSaturday\tIndependence Day\tGazetted Holiday\t
26 Aug\tWednesday\tMilad un-Nabi\tGazetted Holiday\t (floating)
2 Oct\tFriday\tMahatma Gandhi Jayanti\tGazetted Holiday\t
20 Oct\tTuesday\tDussehra\tGazetted Holiday\t
8 Nov\tSunday\tDiwali/Deepavali\tGazetted Holiday\t
24 Nov\tTuesday\tGuru Nanak Jayanti\tGazetted Holiday\t (floating)
25 Dec\tFriday\tChristmas\tGazetted Holiday (floating)`;

describe('parseHolidayLines', () => {
  it('reads all 17 lines of the real pasted calendar, none skipped', () => {
    const { found, skipped } = parseHolidayLines(REAL_2026_LIST, 2026);
    expect(found).toHaveLength(17);
    expect(skipped).toHaveLength(0);
  });

  it('gets the dates and names right, including the floating-note lines', () => {
    const { found } = parseHolidayLines(REAL_2026_LIST, 2026);
    expect(found[0]).toEqual({ date: '2026-01-26', name: 'Republic Day' });
    expect(found.find((h) => h.date === '2026-08-26')).toEqual({ date: '2026-08-26', name: 'Milad un-Nabi' });
    expect(found.find((h) => h.date === '2026-12-25')).toEqual({ date: '2026-12-25', name: 'Christmas' });
  });

  it('handles single-space formatting, not just tabs', () => {
    const { found, skipped } = parseHolidayLines('20 Oct Tuesday Dussehra Gazetted Holiday', 2026);
    expect(skipped).toHaveLength(0);
    expect(found[0]).toEqual({ date: '2026-10-20', name: 'Dussehra' });
  });

  it('handles a bare "date + name" line with nothing else', () => {
    const { found } = parseHolidayLines('25 Dec Christmas', 2026);
    expect(found[0]).toEqual({ date: '2026-12-25', name: 'Christmas' });
  });

  it('skips a line with no leading date instead of guessing', () => {
    const { found, skipped } = parseHolidayLines('Just some text, no date here', 2026);
    expect(found).toHaveLength(0);
    expect(skipped).toEqual(['Just some text, no date here']);
  });

  it('skips an out-of-range day number', () => {
    const { found, skipped } = parseHolidayLines('35 Jan Not A Real Day', 2026);
    expect(found).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('skips an unrecognised month', () => {
    const { found, skipped } = parseHolidayLines('15 Xyz Something', 2026);
    expect(found).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('ignores blank lines', () => {
    const { found, skipped } = parseHolidayLines('26 Jan Republic Day\n\n\n25 Dec Christmas', 2026);
    expect(found).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('pads single-digit days and months into a real ISO date', () => {
    const { found } = parseHolidayLines('4 Mar Holi', 2026);
    expect(found[0].date).toBe('2026-03-04');
  });
});
