// Everything in the app agrees on one company timezone. Day keys are stored as
// UTC-midnight Date values (Prisma @db.Date), so they never drift by an hour.

export const TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parts(instant = new Date()) {
  const out = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  // en-CA renders midnight as 24; normalise it back to 00.
  if (out.hour === '24') out.hour = '00';
  return out;
}

/** "YYYY-MM-DD" for an instant, read in the company timezone. */
export function dayKey(instant = new Date()) {
  const p = parts(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" for an instant, read in the company timezone. */
export function timeKey(instant = new Date()) {
  const p = parts(instant);
  return `${p.hour}:${p.minute}`;
}

/** A "YYYY-MM-DD" key as the UTC-midnight Date that Prisma stores for @db.Date. */
export function dayDate(key) {
  return new Date(`${typeof key === 'string' ? key : dayKey(key)}T00:00:00.000Z`);
}

export function today() {
  return dayDate(dayKey());
}

/** Shift a day key by whole days without ever touching local time. */
export function shiftDay(key, delta) {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday for a day key: 1 = Monday .. 7 = Sunday. */
export function weekday(key) {
  const d = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isWorkingDay(key, workingDays, holidayKeys = new Set()) {
  return workingDays.includes(weekday(key)) && !holidayKeys.has(key);
}

/** Inclusive list of day keys. */
export function rangeKeys(fromKey, toKey) {
  const out = [];
  let cursor = fromKey;
  // Guard against an inverted range rather than looping forever.
  if (fromKey > toKey) return out;
  while (cursor <= toKey) {
    out.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return out;
}

/** The last N days ending today, oldest first. */
export function lastNDays(n, endKey = dayKey()) {
  return rangeKeys(shiftDay(endKey, -(n - 1)), endKey);
}

/** The previous working day before `key`, or null if none within the lookback. */
export function previousWorkingDay(key, workingDays, holidayKeys = new Set(), lookback = 14) {
  let cursor = shiftDay(key, -1);
  for (let i = 0; i < lookback; i += 1) {
    if (isWorkingDay(cursor, workingDays, holidayKeys)) return cursor;
    cursor = shiftDay(cursor, -1);
  }
  return null;
}

/** Minutes past midnight for "HH:MM". */
export function minutesOfDay(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatClock(hhmm) {
  const mins = minutesOfDay(hhmm);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDayLabel(key, opts = {}) {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...opts,
  });
}

/** Aggregate hours, the way the figures read on a dashboard: 369h, 30.8h, 3.5h. */
export function formatHours(totalMinutes) {
  const hours = Math.max(0, totalMinutes) / 60;
  return hours >= 100 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

export function formatDuration(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
