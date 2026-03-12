/**
 * Schedule calculator for AutoShell dry-run preview.
 *
 * Computes the next N scheduled run dates from a schedule config object.
 * Pure function — no side effects, no I/O.
 */

/** Weekday name → JS Date.getDay() mapping (Sun=0 .. Sat=6). */
const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Calculate the next N scheduled run dates from a schedule config.
 *
 * @param {object} schedule - Schedule config object (type, time, date, weekdays, cron).
 * @param {number} [count=5] - Number of future dates to calculate.
 * @param {Date} [from=new Date()] - Reference date to calculate from.
 * @returns {Date[]} Array of next scheduled dates, sorted ascending.
 */
export function getNextRuns(schedule, count = 5, from = new Date()) {
  if (!schedule || count <= 0) return [];
  const now = from;
  switch (schedule.type) {
    case 'once': return getNextOnce(schedule, now);
    case 'daily': return getNextDaily(schedule, now, count);
    case 'weekly': return getNextWeekly(schedule, now, count);
    case 'cron': return getNextCron(schedule, now, count);
    default: return [];
  }
}

/**
 * Format a Date for human-readable display.
 * @param {Date} date
 * @returns {string} e.g. "Mon 2026-03-16 09:00"
 */
export function formatRunDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = days[date.getDay()];
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const iso = `${yyyy}-${mo}-${dd}`;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${d} ${iso} ${hh}:${mm}`;
}

/**
 * Parse "HH:MM" into { hours, minutes }.
 * @param {string} time
 * @returns {{ hours: number, minutes: number }}
 */
function parseTime(time) {
  const [h, m] = (time || '00:00').split(':').map(Number);
  return { hours: h, minutes: m };
}

/** Once: return [date] if future, [] if past. */
function getNextOnce(schedule, now) {
  const { hours, minutes } = parseTime(schedule.time);
  const date = new Date(schedule.date);
  date.setHours(hours, minutes, 0, 0);
  return date > now ? [date] : [];
}

/** Daily: next occurrence at schedule.time, then +24h increments. */
function getNextDaily(schedule, now, count) {
  const { hours, minutes } = parseTime(schedule.time);
  const results = [];
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  for (let i = 0; i < count; i++) {
    results.push(new Date(next));
    next.setDate(next.getDate() + 1);
  }
  return results;
}

/** Weekly: merge-sort next occurrences across all configured weekdays. */
function getNextWeekly(schedule, now, count) {
  const { hours, minutes } = parseTime(schedule.time);
  const weekdays = (schedule.weekdays || []).map((d) => DAY_MAP[d]).filter((d) => d !== undefined);
  if (weekdays.length === 0) return [];

  const results = [];
  // Compute next occurrence for each weekday, then pick smallest repeatedly
  const cursors = weekdays.map((wd) => {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    let diff = wd - d.getDay();
    if (diff < 0 || (diff === 0 && d <= now)) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
  });

  for (let i = 0; i < count; i++) {
    // Find earliest cursor
    let minIdx = 0;
    for (let j = 1; j < cursors.length; j++) {
      if (cursors[j] < cursors[minIdx]) minIdx = j;
    }
    results.push(new Date(cursors[minIdx]));
    // Advance that cursor by 7 days
    cursors[minIdx].setDate(cursors[minIdx].getDate() + 7);
  }
  return results;
}

/** Cron: basic 5-field parser, iterate forward minute-by-minute (capped at 366 days). */
function getNextCron(schedule, now, count) {
  const fields = parseCronFields(schedule.cron);
  if (!fields) return [];

  const results = [];
  const cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1); // Start from next minute

  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 366);

  while (results.length < count && cursor < maxDate) {
    if (
      fields.minutes.has(cursor.getMinutes()) &&
      fields.hours.has(cursor.getHours()) &&
      fields.daysOfMonth.has(cursor.getDate()) &&
      fields.months.has(cursor.getMonth() + 1) &&
      fields.daysOfWeek.has(cursor.getDay())
    ) {
      results.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return results;
}

/**
 * Parse a 5-field cron expression into Sets of valid values.
 * Supports: numbers, *, ranges (1-5), lists (1,3,5), and step values (asterisk/N).
 * @param {string} expr - Cron expression "min hour dom month dow"
 * @returns {{ minutes: Set, hours: Set, daysOfMonth: Set, months: Set, daysOfWeek: Set } | null}
 */
function parseCronFields(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  try {
    return {
      minutes: expandField(parts[0], 0, 59),
      hours: expandField(parts[1], 0, 23),
      daysOfMonth: expandField(parts[2], 1, 31),
      months: expandField(parts[3], 1, 12),
      daysOfWeek: expandField(parts[4], 0, 6),
    };
  } catch {
    return null;
  }
}

/**
 * Expand a single cron field into a Set of integers.
 * Handles: *, N, N-M, N,M, asterisk/S
 */
function expandField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr);
      if (!step || step <= 0) throw new Error(`Invalid step: ${stepStr}`);
      const start = range === '*' ? min : Number(range);
      for (let i = start; i <= max; i += step) values.add(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.add(i);
    } else if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else {
      values.add(Number(part));
    }
  }
  return values;
}
