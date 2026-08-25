export const TASK_REPEATS = ['NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function utcDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

export function addUtcDays(d, n) {
  const next = utcDate(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

export function isoWeekday(d) {
  const js = utcDate(d).getUTCDay();
  return js === 0 ? 7 : js;
}

export function parseRepeat(value) {
  const v = String(value || 'NONE').toUpperCase();
  return TASK_REPEATS.includes(v) ? v : 'NONE';
}

export function parseWeekdays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
}

export function parseYmd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  if (!YMD.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export function parseInterval(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(365, Math.floor(n));
}

export function parseCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(999, Math.floor(n));
}

function addWeekdays(from, steps) {
  let day = utcDate(from);
  let left = steps;
  while (left > 0) {
    day = addUtcDays(day, 1);
    if (isoWeekday(day) !== 7) left -= 1;
  }
  return day;
}

function addUtcMonths(from, months) {
  const start = utcDate(from);
  const dayNum = start.getUTCDate();
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, dayNum));
  if (next.getUTCDate() !== dayNum) {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months + 1, 0));
  }
  return next;
}

function mondayUtc(d) {
  const x = utcDate(d);
  return addUtcDays(x, 1 - isoWeekday(x));
}

function weekIndex(d) {
  return Math.round(mondayUtc(d).getTime() / (7 * 86400000));
}

/**
 * Normalise repeat fields from an assign/edit payload.
 * Repeating tasks without a deadline start on `todayKey`.
 */
export function parseRepeatInput(body, { todayKey } = {}) {
  const repeat = parseRepeat(body.repeat);
  let dueDate = parseYmd(body.dueDate);
  if (repeat !== 'NONE' && !dueDate && todayKey) dueDate = parseYmd(todayKey);

  if (repeat === 'NONE') {
    return { repeat: 'NONE', dueDate, repeatUntil: null, repeatWeekdays: [], repeatInterval: 1, repeatCount: null };
  }

  const repeatUntil = parseYmd(body.repeatUntil);
  const repeatInterval = parseInterval(body.repeatInterval);
  const repeatCount = parseCount(body.repeatCount);
  let repeatWeekdays = parseWeekdays(body.repeatWeekdays);
  if (repeat === 'WEEKLY' && repeatWeekdays.length === 0 && dueDate) {
    repeatWeekdays = [isoWeekday(dueDate)];
  }

  return { repeat, dueDate, repeatUntil, repeatWeekdays, repeatInterval, repeatCount };
}

export function nextDueDate(from, repeat, { weekdays = [], until = null, interval = 1 } = {}) {
  if (!from || parseRepeat(repeat) === 'NONE') return null;
  const start = utcDate(from);
  const step = parseInterval(interval);
  let next = null;

  switch (parseRepeat(repeat)) {
    case 'DAILY':
      next = addUtcDays(start, step);
      break;
    case 'WEEKDAYS':
      next = addWeekdays(start, step);
      break;
    case 'WEEKLY': {
      const days = weekdays.length ? parseWeekdays(weekdays) : [isoWeekday(start)];
      const origin = weekIndex(start);
      let day = addUtcDays(start, 1);
      for (let i = 0; i < 14 * step + 7; i += 1) {
        if (days.includes(isoWeekday(day))) {
          const diff = weekIndex(day) - origin;
          if (diff >= 0 && diff % step === 0) {
            next = day;
            break;
          }
        }
        day = addUtcDays(day, 1);
      }
      break;
    }
    case 'MONTHLY':
      next = addUtcMonths(start, step);
      break;
    case 'YEARLY':
      next = addUtcMonths(start, step * 12);
      break;
    default:
      return null;
  }

  if (!next) return null;
  if (until) {
    const end = utcDate(until);
    if (next.getTime() > end.getTime()) return null;
  }
  return next;
}

export function weeklyPresetLabel(dueDate) {
  const src = dueDate ? utcDate(parseYmd(dueDate) || dueDate) : utcDate(new Date());
  return `Weekly on ${WEEKDAY_LONG[isoWeekday(src) - 1]}`;
}

export function annualPresetLabel(dueDate) {
  if (!dueDate) return 'Annually';
  const src = utcDate(parseYmd(dueDate) || dueDate);
  return `Annually on ${MONTH_LONG[src.getUTCMonth()]} ${src.getUTCDate()}`;
}

export function repeatLabel(task) {
  const repeat = parseRepeat(task?.repeat);
  const interval = parseInterval(task?.repeatInterval);
  if (repeat === 'NONE') return null;
  if (repeat === 'WEEKDAYS') return 'Every weekday (Monday to Saturday)';
  if (repeat === 'DAILY') return interval === 1 ? 'Daily' : `Every ${interval} days`;
  if (repeat === 'WEEKLY') {
    const days = parseWeekdays(task?.repeatWeekdays);
    const names = (days.length ? days : task?.dueDate ? [isoWeekday(task.dueDate)] : [])
      .map((d) => WEEKDAY_LONG[d - 1]);
    if (interval === 1 && names.length === 1) return `Weekly on ${names[0]}`;
    if (interval === 1 && names.length) return `Weekly on ${names.join(', ')}`;
    if (names.length) return `Every ${interval} weeks on ${names.join(', ')}`;
    return interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
  }
  if (repeat === 'MONTHLY') return interval === 1 ? 'Monthly' : `Every ${interval} months`;
  if (repeat === 'YEARLY') return interval === 1 ? annualPresetLabel(task?.dueDate) : `Every ${interval} years`;
  return repeat;
}

/** Which Google-style menu item the current form matches. CUSTOM if it only fits the dialog. */
export function repeatSelectValue(form) {
  const repeat = parseRepeat(form?.repeat);
  const interval = parseInterval(form?.repeatInterval);
  const hasUntil = Boolean(form?.repeatUntil);
  const hasCount = parseCount(form?.repeatCount) != null;
  if (repeat === 'NONE') return 'NONE';
  if (hasUntil || hasCount || interval > 1 || repeat === 'MONTHLY') return 'CUSTOM';
  if (repeat === 'DAILY') return 'DAILY';
  if (repeat === 'WEEKDAYS') return 'WEEKDAYS';
  if (repeat === 'YEARLY') return 'YEARLY';
  if (repeat === 'WEEKLY') {
    const days = parseWeekdays(form?.repeatWeekdays);
    const due = form?.dueDate ? parseYmd(form.dueDate) || utcDate(form.dueDate) : null;
    if (days.length === 1 && due && days[0] === isoWeekday(due)) return 'WEEKLY';
    if (days.length <= 1) return 'WEEKLY';
    return 'CUSTOM';
  }
  return 'CUSTOM';
}

/** Repeating tasks only land on the plan on or after their due day. One-offs stay on the plan while open. */
export function belongsOnTodayPlan(task, todayKey) {
  if (parseRepeat(task.repeat) === 'NONE') return true;
  if (!task.dueDate) return true;
  return utcDate(task.dueDate).toISOString().slice(0, 10) <= todayKey;
}
