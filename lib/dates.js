// Everything in the app agrees on one company timezone. Day keys are stored as
// UTC-midnight Date values (Prisma @db.Date), so they never drift by an hour.
//
// Date rule (explicit): WorkSession.date, Attendance.date, and every day-boundary
// (todayKey, startOfDay, endOfDay, fromPastDay, split-at-midnight) use the
// **company-local calendar day** in APP_TIMEZONE (default Asia/Kolkata) — not
// UTC's date, and not each person's own timezone. An instant at 00:30 IST on
// 12 Aug is 11 Aug 19:00 UTC; it still belongs to 12 Aug.

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

/**
 * The calendar-day key stored on a Prisma @db.Date column (UTC midnight).
 * Use this for session.date / attendance.date; use dayKey() for instants.
 */
export function dateFieldKey(dateValue) {
  return dateValue.toISOString().slice(0, 10);
}

export function today() {
  return dayDate(dayKey());
}

/** The first instant of a company-local calendar day. */
export function startOfDay(key) {
  return zonedTimeToUtc(typeof key === 'string' ? key : dayKey(key), '00:00');
}

/**
 * The first instant of the next company-local calendar day. A session that
 * reaches midnight closes here; the continuation starts here — no gap, no overlap.
 */
export function endOfDay(key) {
  const k = typeof key === 'string' ? key : dayKey(key);
  return startOfDay(shiftDay(k, 1));
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

/** "HH:MM" from minutes past midnight. Returns null if the value is outside 00:00–23:59. */
export function clockFromMinutes(total) {
  if (!Number.isFinite(total) || total < 0 || total >= 24 * 60) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Lead time before each person's check-in deadline for the Slack nudge. */
export const CHECK_IN_NUDGE_LEAD_MINUTES = 15;
/** How long after the nudge instant a cron pass may still fire (covers a late 5-minute tick). */
export const CHECK_IN_NUDGE_WINDOW_MINUTES = 8;
/** Company-local hours the nudge cron is allowed to run (inclusive). */
export const CHECK_IN_NUDGE_RUN_START = '08:30';
export const CHECK_IN_NUDGE_RUN_END = '10:30';

/** True when company-local `nowHhmm` is inside the 08:30–10:30 run window. */
export function isCheckInNudgeRunOpen(nowHhmm) {
  const now = minutesOfDay(nowHhmm);
  return now >= minutesOfDay(CHECK_IN_NUDGE_RUN_START) && now <= minutesOfDay(CHECK_IN_NUDGE_RUN_END);
}

/** 09:30 with a 15-minute lead → 09:15. Returns null if that would fall before midnight. */
export function checkInNudgeClock(deadlineHhmm, leadMinutes = CHECK_IN_NUDGE_LEAD_MINUTES) {
  return clockFromMinutes(minutesOfDay(deadlineHhmm) - leadMinutes);
}

/**
 * True when company-local `nowHhmm` sits in [deadline − lead, deadline − lead + window).
 * 09:30 people match at 09:15; 10:00 people match at 09:45.
 */
export function isInCheckInNudgeWindow(
  nowHhmm,
  deadlineHhmm,
  leadMinutes = CHECK_IN_NUDGE_LEAD_MINUTES,
  windowMinutes = CHECK_IN_NUDGE_WINDOW_MINUTES,
) {
  const nudge = minutesOfDay(deadlineHhmm) - leadMinutes;
  if (nudge < 0) return false;
  const now = minutesOfDay(nowHhmm);
  return now >= nudge && now < nudge + windowMinutes;
}

/** The instant a wall-clock "HH:MM" on day `key` falls at, read in the company timezone. */
export function zonedTimeToUtc(key, hhmm) {
  const guess = new Date(`${key}T${hhmm}:00.000Z`);
  const readAsZoned = parts(guess);
  const offset =
    new Date(`${readAsZoned.year}-${readAsZoned.month}-${readAsZoned.day}T${readAsZoned.hour}:${readAsZoned.minute}:00.000Z`) -
    guess;
  return new Date(guess.getTime() - offset);
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

/** Minutes of a closed session. Open rows (endedAt null) return 0, never NaN. */
export function closedMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  const end = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime();
  const minutes = (end - start) / 60000;
  return Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
}
