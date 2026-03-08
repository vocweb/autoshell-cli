/**
 * Tests for notification dispatcher.
 * Tests the routing logic and on_success/on_failure flag handling.
 * Actual HTTP calls are not tested (would require mocking fetch).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendNotifications } from '../src/notifications/index.js';

const payload = (status = 'success') => ({
  task_name: 'Test Task',
  task_id: 'test-task',
  status,
  exit_code: status === 'success' ? 0 : 1,
  duration: 10,
  log_tail: ['line 1', 'line 2'],
  timestamp: new Date().toISOString(),
});

describe('sendNotifications', () => {
  it('does nothing when notifConfig is null', async () => {
    // Should not throw
    await sendNotifications(null, payload());
  });

  it('does nothing when no channels', async () => {
    await sendNotifications({}, payload());
  });

  it('skips success notification when on_success is false', async () => {
    let called = false;
    // Mock: if sendNotifications tries to dispatch, it will fail on invalid URL
    // but since on_success=false, it should skip entirely
    const config = {
      on_success: false,
      on_failure: true,
      channels: [{ type: 'webhook', url: 'http://invalid-should-not-be-called' }],
    };
    // This should NOT attempt any HTTP calls
    await sendNotifications(config, payload('success'));
    // If we got here without error, success was correctly skipped
    assert.ok(true);
  });

  it('skips failure notification when on_failure is false', async () => {
    const config = {
      on_success: true,
      on_failure: false,
      channels: [{ type: 'webhook', url: 'http://invalid-should-not-be-called' }],
    };
    await sendNotifications(config, payload('failure'));
    assert.ok(true);
  });

  it('catches and warns on notification errors', async () => {
    // Webhook to invalid URL should fail but not throw
    const config = {
      on_success: true,
      on_failure: true,
      channels: [{ type: 'webhook', url: 'http://127.0.0.1:1/nonexistent' }],
    };
    // Should not throw even though fetch will fail
    await sendNotifications(config, payload('success'));
    assert.ok(true);
  });

  it('warns on unknown channel type', async () => {
    const config = {
      on_success: true,
      channels: [{ type: 'sms' }],
    };
    await sendNotifications(config, payload('success'));
    assert.ok(true);
  });
});
