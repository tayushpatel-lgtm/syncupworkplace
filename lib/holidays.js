const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const HOLIDAY_TYPE = /\b(Gazetted Holiday|Restricted Holiday|Central Government Holiday|Optional Holiday|Public Holiday)\b/i;
const FLOATING = /\(floating\)/i;

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parses a pasted holiday calendar — one holiday per line, tolerant of the
 * shape a government calendar table copy-pastes as: a leading date ("26 Jan"),
 * then the weekday, name and holiday-type in whatever columns the source used
 * (tab-separated if it came from a spreadsheet, loose text otherwise).
 *
 * Only the date and the name make it into the app — weekday and type are
 * there for a human to read, not stored.
 */
export function parseHolidayLines(text, year) {
  const found = [];
  const skipped = [];

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const dateMatch = line.match(/^(\d{1,2})\s+([A-Za-z]{3,})/);
    if (!dateMatch) {
      skipped.push(raw);
      continue;
    }

    const day = Number(dateMatch[1]);
    const month = MONTHS[dateMatch[2].slice(0, 3).toLowerCase()];
    if (!month || day < 1 || day > 31) {
      skipped.push(raw);
      continue;
    }

    let rest = line.slice(dateMatch[0].length).trim();
    let name = '';

    if (rest.includes('\t')) {
      const cols = rest.split('\t').map((c) => c.trim()).filter(Boolean);
      const startsWithWeekday = cols[0] && WEEKDAY.test(cols[0]);
      name = (startsWithWeekday ? cols[1] : cols[0]) || '';
    } else {
      rest = rest.replace(WEEKDAY, '').trim();
      const typeMatch = rest.match(HOLIDAY_TYPE);
      if (typeMatch) rest = rest.slice(0, typeMatch.index).trim();
      name = rest;
    }

    name = name.replace(FLOATING, '').trim();
    if (!name) {
      skipped.push(raw);
      continue;
    }

    found.push({ date: `${year}-${pad(month)}-${pad(day)}`, name });
  }

  return { found, skipped };
}
