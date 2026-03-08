/**
 * Tests for config parser and validator.
 * Covers valid configs, defaults, error cases, and format detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfigString } from '../src/config/parser.js';
import { validateConfig } from '../src/config/validator.js';

// -- Helper: minimal valid record --
const minimal = () => ({
  name: 'Test',
  schedule: { type: 'daily', time: '09:00' },
  commands: ['echo hello'],
});

describe('parseConfigString', () => {
  it('parses valid YAML multi-record config', async () => {
    const yaml = `
records:
  - name: "Task A"
    schedule: { type: daily, time: "09:00" }
    commands: ["echo A"]
`;
    const config = parseConfigString(yaml, 'yaml');
    assert.equal(config.records.length, 1);
    assert.equal(config.records[0].name, 'Task A');
  });

  it('parses valid JSON config', () => {
    const json = JSON.stringify({ records: [minimal()] });
    const config = parseConfigString(json, 'json');
    assert.equal(config.records.length, 1);
  });

  it('parses single-record format (no records wrapper)', () => {
    const yaml = `
name: "Solo Task"
schedule: { type: daily, time: "08:00" }
commands: ["echo solo"]
`;
    const config = parseConfigString(yaml, 'yaml');
    assert.equal(config.records.length, 1);
    assert.equal(config.records[0].name, 'Solo Task');
  });

  it('applies default enabled=true', () => {
    const config = parseConfigString(JSON.stringify({ records: [minimal()] }), 'json');
    assert.equal(config.records[0].enabled, true);
  });

  it('applies default logging values', () => {
    const rec = { ...minimal(), logging: { enabled: true } };
    const config = parseConfigString(JSON.stringify({ records: [rec] }), 'json');
    assert.equal(config.records[0].logging.max_size, '10MB');
    assert.equal(config.records[0].logging.retention, 7);
  });

  it('applies default notification values', () => {
    const rec = {
      ...minimal(),
      notifications: {
        channels: [{ type: 'webhook', url: 'https://example.com' }],
      },
    };
    const config = parseConfigString(JSON.stringify({ records: [rec] }), 'json');
    assert.equal(config.records[0].notifications.on_success, false);
    assert.equal(config.records[0].notifications.on_failure, true);
  });

  it('applies default rate_limit.max_wait_minutes', () => {
    const rec = {
      ...minimal(),
      interactive: [{
        program: 'claude',
        inputs: ['/help'],
        rate_limit: { preset: 'claude-code' },
      }],
    };
    const config = parseConfigString(JSON.stringify({ records: [rec] }), 'json');
    assert.equal(config.records[0].interactive[0].rate_limit.max_wait_minutes, 180);
  });

  it('throws on invalid YAML syntax', () => {
    assert.throws(() => parseConfigString('{{invalid', 'yaml'), /Failed to parse YAML/);
  });

  it('throws on invalid JSON syntax', () => {
    assert.throws(() => parseConfigString('{bad json', 'json'), /Failed to parse JSON/);
  });
});

describe('validateConfig — valid configs', () => {
  it('accepts daily schedule', () => {
    const result = validateConfig({ records: [minimal()] });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('accepts once schedule with date', () => {
    const rec = {
      name: 'Once',
      schedule: { type: 'once', time: '03:00', date: '2026-04-01' },
      commands: ['echo once'],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, true);
  });

  it('accepts weekly schedule with weekdays', () => {
    const rec = {
      name: 'Weekly',
      schedule: { type: 'weekly', time: '10:00', weekdays: ['Mon', 'Fri'] },
      commands: ['echo weekly'],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, true);
  });

  it('accepts cron schedule', () => {
    const rec = {
      name: 'Cron',
      schedule: { type: 'cron', cron: '*/15 * * * *' },
      commands: ['echo cron'],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, true);
  });

  it('accepts interactive block without commands', () => {
    const rec = {
      name: 'Interactive',
      schedule: { type: 'daily', time: '09:00' },
      interactive: [{
        program: 'claude',
        inputs: ['/help'],
      }],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, true);
  });

  it('accepts full config with env and working_dir', () => {
    const rec = {
      ...minimal(),
      working_dir: '~/projects',
      env: { NODE_ENV: 'production', API_KEY: 'test' },
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, true);
  });
});

describe('validateConfig — error cases', () => {
  it('rejects null config', () => {
    const result = validateConfig(null);
    assert.equal(result.valid, false);
  });

  it('rejects missing records', () => {
    const result = validateConfig({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('records')));
  });

  it('rejects empty records array', () => {
    const result = validateConfig({ records: [] });
    assert.equal(result.valid, false);
  });

  it('rejects missing name', () => {
    const rec = { schedule: { type: 'daily', time: '09:00' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  it('rejects duplicate names', () => {
    const result = validateConfig({ records: [minimal(), minimal()] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Duplicate')));
  });

  it('rejects missing schedule', () => {
    const rec = { name: 'NoSched', commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('schedule')));
  });

  it('rejects invalid schedule type', () => {
    const rec = { name: 'Bad', schedule: { type: 'hourly', time: '09:00' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('type')));
  });

  it('rejects missing time for daily', () => {
    const rec = { name: 'NoTime', schedule: { type: 'daily' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('time')));
  });

  it('rejects invalid time format', () => {
    const rec = { name: 'BadTime', schedule: { type: 'daily', time: '9am' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
  });

  it('rejects once without date', () => {
    const rec = { name: 'NoDate', schedule: { type: 'once', time: '03:00' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('date')));
  });

  it('rejects weekly without weekdays', () => {
    const rec = { name: 'NoDay', schedule: { type: 'weekly', time: '10:00' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('weekdays')));
  });

  it('rejects invalid weekday', () => {
    const rec = { name: 'BadDay', schedule: { type: 'weekly', time: '10:00', weekdays: ['Monday'] }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('weekday')));
  });

  it('rejects cron without cron expression', () => {
    const rec = { name: 'NoCron', schedule: { type: 'cron' }, commands: ['echo'] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('cron')));
  });

  it('rejects missing commands and no interactive', () => {
    const rec = { name: 'NoCmds', schedule: { type: 'daily', time: '09:00' } };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('commands')));
  });

  it('rejects empty commands array', () => {
    const rec = { name: 'Empty', schedule: { type: 'daily', time: '09:00' }, commands: [] };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
  });

  it('rejects interactive without program', () => {
    const rec = {
      name: 'NoProg',
      schedule: { type: 'daily', time: '09:00' },
      interactive: [{ inputs: ['/help'] }],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('program')));
  });

  it('rejects interactive without inputs', () => {
    const rec = {
      name: 'NoInput',
      schedule: { type: 'daily', time: '09:00' },
      interactive: [{ program: 'claude' }],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('inputs')));
  });

  it('rejects invalid rate_limit action', () => {
    const rec = {
      name: 'BadAction',
      schedule: { type: 'daily', time: '09:00' },
      interactive: [{
        program: 'claude',
        inputs: ['/help'],
        rate_limit: { detect_pattern: 'rate limit', action: 'invalid' },
      }],
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('action')));
  });

  it('rejects invalid notification channel type', () => {
    const rec = {
      ...minimal(),
      notifications: {
        channels: [{ type: 'sms' }],
      },
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('type')));
  });

  it('rejects slack channel without webhook_url', () => {
    const rec = {
      ...minimal(),
      notifications: {
        channels: [{ type: 'slack' }],
      },
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('webhook_url')));
  });

  it('rejects invalid logging max_size format', () => {
    const rec = {
      ...minimal(),
      logging: { max_size: '10 megabytes' },
    };
    const result = validateConfig({ records: [rec] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('max_size')));
  });
});
