/**
 * Tests for scheduler modules.
 * Focuses on testable pure functions (cron conversion, calendar expressions)
 * rather than system commands (launchctl, systemctl, schtasks).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getScheduler } from '../src/schedulers/index.js';
import { scheduleToCalendar, cronToCalendar } from '../src/schedulers/systemd.js';

describe('getScheduler', () => {
  it('returns a scheduler module for current platform', async () => {
    const scheduler = await getScheduler();
    assert.ok(scheduler.install, 'scheduler should have install()');
    assert.ok(scheduler.uninstall, 'scheduler should have uninstall()');
    assert.ok(scheduler.list, 'scheduler should have list()');
    assert.ok(scheduler.isInstalled, 'scheduler should have isInstalled()');
  });
});

describe('systemd — scheduleToCalendar', () => {
  it('converts daily schedule', () => {
    const result = scheduleToCalendar({ type: 'daily', time: '09:00' });
    assert.equal(result, '*-*-* 09:00:00');
  });

  it('converts once schedule', () => {
    const result = scheduleToCalendar({ type: 'once', time: '03:00', date: '2026-04-01' });
    assert.equal(result, '2026-04-01 03:00:00');
  });

  it('converts weekly schedule', () => {
    const result = scheduleToCalendar({ type: 'weekly', time: '10:00', weekdays: ['Mon', 'Wed', 'Fri'] });
    assert.equal(result, 'Mon,Wed,Fri *-*-* 10:00:00');
  });

  it('converts cron schedule', () => {
    const result = scheduleToCalendar({ type: 'cron', cron: '30 14 * * *' });
    assert.equal(result, '*-*-* 14:30:00');
  });
});

describe('systemd — cronToCalendar', () => {
  it('converts daily cron (0 9 * * *)', () => {
    assert.equal(cronToCalendar('0 9 * * *'), '*-*-* 09:00:00');
  });

  it('converts weekday range (0 9 * * 1-5)', () => {
    assert.equal(cronToCalendar('0 9 * * 1-5'), 'Mon..Fri *-*-* 09:00:00');
  });

  it('converts monthly (0 0 1 * *)', () => {
    assert.equal(cronToCalendar('0 0 1 * *'), '*-*-01 00:00:00');
  });

  it('converts with specific minute (30 14 * * *)', () => {
    assert.equal(cronToCalendar('30 14 * * *'), '*-*-* 14:30:00');
  });

  it('converts single weekday (0 8 * * 0)', () => {
    const result = cronToCalendar('0 8 * * 0');
    assert.equal(result, 'Sun *-*-* 08:00:00');
  });

  it('returns original string for invalid cron', () => {
    assert.equal(cronToCalendar('invalid'), 'invalid');
  });
});
