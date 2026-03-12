/**
 * Tests for schedule calculator utility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getNextRuns, formatRunDate } from '../src/utils/schedule-calculator.js';

describe('getNextRuns — once', () => {
  it('returns 1 date for future once schedule', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const result = getNextRuns({ type: 'once', date: dateStr, time: '09:00' });
    assert.equal(result.length, 1);
    assert.equal(result[0].getHours(), 9);
    assert.equal(result[0].getMinutes(), 0);
  });

  it('returns empty array for past once schedule', () => {
    const result = getNextRuns({ type: 'once', date: '2020-01-01', time: '00:00' });
    assert.deepEqual(result, []);
  });
});

describe('getNextRuns — daily', () => {
  it('returns 5 dates by default', () => {
    const result = getNextRuns({ type: 'daily', time: '09:00' });
    assert.equal(result.length, 5);
  });

  it('all dates are at specified time', () => {
    const result = getNextRuns({ type: 'daily', time: '14:30' });
    for (const d of result) {
      assert.equal(d.getHours(), 14);
      assert.equal(d.getMinutes(), 30);
    }
  });

  it('dates are 24h apart', () => {
    const result = getNextRuns({ type: 'daily', time: '09:00' });
    for (let i = 1; i < result.length; i++) {
      const diff = result[i] - result[i - 1];
      assert.equal(diff, 24 * 60 * 60 * 1000);
    }
  });

  it('respects custom count', () => {
    const result = getNextRuns({ type: 'daily', time: '09:00' }, 3);
    assert.equal(result.length, 3);
  });
});

describe('getNextRuns — weekly', () => {
  it('returns dates only on specified weekdays', () => {
    const result = getNextRuns({ type: 'weekly', weekdays: ['Mon', 'Wed', 'Fri'], time: '10:00' });
    const validDays = new Set([1, 3, 5]); // Mon, Wed, Fri
    for (const d of result) {
      assert.ok(validDays.has(d.getDay()), `${d} should be Mon, Wed, or Fri`);
    }
  });

  it('returns dates sorted chronologically', () => {
    const result = getNextRuns({ type: 'weekly', weekdays: ['Mon', 'Wed', 'Fri'], time: '10:00' }, 10);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i] > result[i - 1], 'Dates should be in ascending order');
    }
  });

  it('returns correct time for weekly', () => {
    const result = getNextRuns({ type: 'weekly', weekdays: ['Tue'], time: '15:45' });
    for (const d of result) {
      assert.equal(d.getHours(), 15);
      assert.equal(d.getMinutes(), 45);
    }
  });

  it('returns empty for no weekdays', () => {
    const result = getNextRuns({ type: 'weekly', weekdays: [], time: '10:00' });
    assert.deepEqual(result, []);
  });
});

describe('getNextRuns — cron', () => {
  it('parses daily 9am cron', () => {
    const result = getNextRuns({ type: 'cron', cron: '0 9 * * *' });
    assert.equal(result.length, 5);
    for (const d of result) {
      assert.equal(d.getHours(), 9);
      assert.equal(d.getMinutes(), 0);
    }
  });

  it('parses weekday-only cron (Mon-Fri)', () => {
    const result = getNextRuns({ type: 'cron', cron: '0 9 * * 1-5' }, 10);
    for (const d of result) {
      assert.ok(d.getDay() >= 1 && d.getDay() <= 5, `${d} should be weekday`);
    }
  });

  it('returns empty for invalid cron', () => {
    assert.deepEqual(getNextRuns({ type: 'cron', cron: 'invalid' }), []);
    assert.deepEqual(getNextRuns({ type: 'cron', cron: null }), []);
  });
});

describe('getNextRuns — edge cases', () => {
  it('returns empty for unknown type', () => {
    assert.deepEqual(getNextRuns({ type: 'unknown' }), []);
  });

  it('returns empty for null schedule', () => {
    assert.deepEqual(getNextRuns(null), []);
  });

  it('returns empty for count=0', () => {
    assert.deepEqual(getNextRuns({ type: 'daily', time: '09:00' }, 0), []);
  });

  it('respects from parameter as reference date', () => {
    const referenceDate = new Date(2026, 0, 15, 8, 0); // Jan 15 2026, 08:00
    const result = getNextRuns({ type: 'daily', time: '09:00' }, 3, referenceDate);
    // First date should be Jan 15 at 09:00 (later on same day)
    assert.equal(result[0].getDate(), 15);
    assert.equal(result[0].getMonth(), 0);
    assert.equal(result[0].getHours(), 9);
    // Second date should be Jan 16 at 09:00
    assert.equal(result[1].getDate(), 16);
    assert.equal(result[1].getMonth(), 0);
  });

  it('respects from parameter for once schedule', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const pastRef = new Date(2020, 0, 1);
    const result = getNextRuns({ type: 'once', date: dateStr, time: '09:00' }, 5, pastRef);
    assert.equal(result.length, 1);
  });

  it('count parameter is negative should return empty', () => {
    assert.deepEqual(getNextRuns({ type: 'daily', time: '09:00' }, -1), []);
  });
});

describe('getNextRuns — cron edge cases', () => {
  it('handles cron with step values', () => {
    // Every 15 minutes at 10am: 0,15,30,45 10 * * *
    const result = getNextRuns({ type: 'cron', cron: '*/15 10 * * *' }, 5);
    assert.ok(result.length > 0, 'Should return results for step values');
    // All should be at hour 10
    for (const d of result) {
      assert.equal(d.getHours(), 10);
    }
  });

  it('handles cron with range values', () => {
    // 9-11am every hour: 0 9-11 * * *
    const result = getNextRuns({ type: 'cron', cron: '0 9-11 * * *' }, 10);
    const hours = new Set(result.map((d) => d.getHours()));
    assert.ok(hours.has(9) || hours.has(10) || hours.has(11), 'Should include hours 9-11');
  });

  it('handles cron with list values', () => {
    // At specific times: 0 0,12 * * *
    const result = getNextRuns({ type: 'cron', cron: '0 0,12 * * *' }, 10);
    const hours = new Set(result.map((d) => d.getHours()));
    // Should only be midnight (0) or noon (12)
    for (const h of hours) {
      assert.ok(h === 0 || h === 12, `Hour should be 0 or 12, got ${h}`);
    }
  });

  it('handles monthly cron', () => {
    // First day of month at 9am: 0 9 1 * *
    const result = getNextRuns({ type: 'cron', cron: '0 9 1 * *' }, 5);
    for (const d of result) {
      assert.equal(d.getDate(), 1);
      assert.equal(d.getHours(), 9);
    }
  });

  it('handles cron with invalid step syntax gracefully', () => {
    const result = getNextRuns({ type: 'cron', cron: '0 9 * * /' }, 5);
    // Should be empty or handle gracefully (invalid)
    assert.ok(Array.isArray(result), 'Should return array even for invalid cron');
  });
});

describe('formatRunDate', () => {
  it('formats date correctly', () => {
    const d = new Date(2026, 2, 16, 9, 0); // Mon Mar 16 2026 09:00
    const result = formatRunDate(d);
    assert.ok(result.includes('Mon'), 'Should include day name');
    assert.ok(result.includes('09:00'), 'Should include time');
    assert.ok(result.includes('2026'), 'Should include year');
  });

  it('pads hours and minutes with zeros', () => {
    const d = new Date(2026, 2, 16, 1, 5); // 01:05
    const result = formatRunDate(d);
    assert.ok(result.includes('01:05'), 'Should zero-pad hours and minutes');
  });

  it('includes ISO date format', () => {
    const d = new Date(2026, 11, 25); // Dec 25 2026
    const result = formatRunDate(d);
    assert.ok(result.includes('2026-12-25'), 'Should use ISO date format');
  });
});
