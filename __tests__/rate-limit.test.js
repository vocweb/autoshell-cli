/**
 * Tests for rate limit handler and presets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWaitTime, createRateLimitMonitor } from '../src/interactive/rate-limit-handler.js';
import { resolveRateLimitConfig, PRESETS } from '../src/interactive/rate-limit-presets.js';

describe('parseWaitTime', () => {
  it('parses hours_minutes format', () => {
    const ms = parseWaitTime('Reset in 2h 15m', {
      pattern: '(\\d+)h\\s*(\\d+)m',
      format: 'hours_minutes',
    });
    assert.equal(ms, (2 * 60 + 15) * 60 * 1000);
  });

  it('parses minutes format', () => {
    const ms = parseWaitTime('wait 30 minutes', {
      pattern: '(\\d+)\\s*min',
      format: 'minutes',
    });
    assert.equal(ms, 30 * 60 * 1000);
  });

  it('parses seconds format', () => {
    const ms = parseWaitTime('retry in 120 seconds', {
      pattern: '(\\d+)\\s*sec',
      format: 'seconds',
    });
    assert.equal(ms, 120 * 1000);
  });

  it('parses iso8601 format', () => {
    const futureDate = new Date(Date.now() + 60000).toISOString();
    const ms = parseWaitTime(`Retry after ${futureDate}`, {
      pattern: 'Retry after (.+)',
      format: 'iso8601',
    });
    // Should be roughly 60 seconds (±1s for execution time)
    assert.ok(ms > 55000 && ms < 65000, `Expected ~60000ms, got ${ms}`);
  });

  it('parses unix_timestamp format', () => {
    const futureTs = Math.floor((Date.now() + 120000) / 1000);
    const ms = parseWaitTime(`retry_after: ${futureTs}`, {
      pattern: 'retry_after: (\\d+)',
      format: 'unix_timestamp',
    });
    assert.ok(ms > 115000 && ms < 125000, `Expected ~120000ms, got ${ms}`);
  });

  it('returns null for no match', () => {
    const ms = parseWaitTime('no match here', {
      pattern: '(\\d+)h\\s*(\\d+)m',
      format: 'hours_minutes',
    });
    assert.equal(ms, null);
  });

  it('returns null for null config', () => {
    assert.equal(parseWaitTime('text', null), null);
  });

  it('returns null for invalid regex', () => {
    assert.equal(parseWaitTime('text', { pattern: '[invalid(', format: 'seconds' }), null);
  });
});

describe('resolveRateLimitConfig', () => {
  it('returns null for null input', () => {
    assert.equal(resolveRateLimitConfig(null), null);
  });

  it('returns config as-is when no preset', () => {
    const config = { detect_pattern: 'test', action: 'exit' };
    const result = resolveRateLimitConfig(config);
    assert.equal(result.detect_pattern, 'test');
    assert.equal(result.action, 'exit');
  });

  it('loads preset defaults', () => {
    const result = resolveRateLimitConfig({ preset: 'claude-code' });
    assert.ok(result.detect_pattern.includes('rate limit'));
    assert.equal(result.max_wait_minutes, 180);
    assert.equal(result.polling_interval_minutes, 5);
  });

  it('overrides preset with user values', () => {
    const result = resolveRateLimitConfig({
      preset: 'claude-code',
      max_wait_minutes: 240,
      action: 'exit',
    });
    assert.equal(result.max_wait_minutes, 240); // User override
    assert.equal(result.action, 'exit');         // User override
    assert.ok(result.detect_pattern);            // From preset
  });

  it('throws for unknown preset', () => {
    assert.throws(() => resolveRateLimitConfig({ preset: 'nonexistent' }), /Unknown rate limit preset/);
  });

  it('has all 10 presets defined', () => {
    const expected = [
      'claude-code', 'aider', 'cursor-cli', 'github-copilot', 'plandex',
      'continue-cli', 'opencode', 'cody-cli', 'gemini-cli', 'goose',
    ];
    for (const name of expected) {
      assert.ok(PRESETS[name], `Missing preset: ${name}`);
      assert.ok(PRESETS[name].detect_pattern, `Preset ${name} missing detect_pattern`);
    }
  });
});

describe('createRateLimitMonitor', () => {
  it('returns noop monitor for null config', () => {
    const monitor = createRateLimitMonitor('test', null);
    assert.equal(monitor.checkLine('anything'), false);
    assert.equal(monitor.isPaused(), false);
  });

  it('detects rate limit from output line', () => {
    let detected = false;
    const monitor = createRateLimitMonitor('test', {
      detect_pattern: 'rate limit',
      action: 'notify_only',
    }, {
      onRateLimited: () => { detected = true; },
    });

    const result = monitor.checkLine('Error: rate limit exceeded');
    assert.equal(result, true);
    assert.equal(detected, true);
    monitor.cleanup();
  });

  it('does not trigger on non-matching lines', () => {
    const monitor = createRateLimitMonitor('test', {
      detect_pattern: 'rate limit',
      action: 'notify_only',
    });

    assert.equal(monitor.checkLine('Processing files...'), false);
    monitor.cleanup();
  });

  it('handles exit action', () => {
    let sentCommand = null;
    const monitor = createRateLimitMonitor('test', {
      detect_pattern: 'rate limit',
      action: 'exit',
    }, {
      onRateLimited: () => {},
      sendCommand: (cmd) => { sentCommand = cmd; },
    });

    monitor.checkLine('rate limit reached');
    assert.equal(sentCommand, '\x03'); // Ctrl+C
    monitor.cleanup();
  });
});
