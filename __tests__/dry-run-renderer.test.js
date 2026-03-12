/**
 * Tests for dry-run renderer module.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderInstallPreview, renderRunPreview, renderJson, collectWarnings } from '../src/renderers/dry-run-renderer.js';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Helper: capture console.log output
function captureOutput(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return fn().then(() => { console.log = orig; return lines.join('\n'); })
    .catch((err) => { console.log = orig; throw err; });
}

// Minimal valid config for testing
const minimalConfig = (overrides = {}) => ({
  settings: {},
  records: [{
    name: 'test-task',
    enabled: true,
    schedule: { type: 'daily', time: '09:00' },
    commands: ['echo hello'],
    ...overrides,
  }],
});

describe('renderInstallPreview — text', () => {
  it('outputs task name in preview', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'text')
    );
    assert.ok(output.includes('test-task'), 'Should contain task name');
  });

  it('shows schedule info', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'text')
    );
    assert.ok(output.includes('daily'), 'Should contain schedule type');
    assert.ok(output.includes('09:00'), 'Should contain schedule time');
  });

  it('shows files to create', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'text')
    );
    assert.ok(output.includes('Script:'), 'Should show script path');
    assert.ok(output.includes('Scheduler:'), 'Should show scheduler path');
    assert.ok(output.includes('Metadata:'), 'Should show metadata path');
  });

  it('notes disabled records as skipped', async () => {
    const config = minimalConfig({ enabled: false });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'text')
    );
    assert.ok(output.includes('Skipped'), 'Should note disabled record');
  });

  it('shows summary line', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'text')
    );
    assert.ok(output.includes('1 task(s) would be installed'), 'Should show install count');
  });

  it('handles multiple configs with multiple tasks', async () => {
    const config1 = minimalConfig({ name: 'task-1' });
    const config2 = minimalConfig({ name: 'task-2' });
    const output = await captureOutput(() =>
      renderInstallPreview([config1, config2], 'darwin', 'text')
    );
    assert.ok(output.includes('task-1'), 'Should include first task');
    assert.ok(output.includes('task-2'), 'Should include second task');
    assert.ok(output.includes('2 task(s) would be installed'), 'Should count both tasks');
  });

  it('shows interactive config when present', async () => {
    const config = minimalConfig({
      interactive: [
        { program: 'expect', inputs: ['yes', 'no'], rate_limit: null },
      ],
    });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'text')
    );
    assert.ok(output.includes('Interactive:'), 'Should show interactive section');
    assert.ok(output.includes('expect'), 'Should show program name');
    assert.ok(output.includes('inputs:'), 'Should show input count');
  });

  it('shows env vars when present', async () => {
    const config = minimalConfig({ env: { FOO: 'bar', BAZ: 'qux' } });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'text')
    );
    assert.ok(output.includes('Env vars:'), 'Should show env vars section');
    assert.ok(output.includes('FOO=bar'), 'Should show env variable');
  });

  it('shows working_dir when present', async () => {
    const config = minimalConfig({ working_dir: '/home/user/project' });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'text')
    );
    assert.ok(output.includes('Working dir:'), 'Should show working dir');
    assert.ok(output.includes('/home/user/project'), 'Should show dir path');
  });

  it('shows notifications when present', async () => {
    const config = minimalConfig({
      notifications: {
        channels: [{ type: 'slack', webhook_url: 'http://example.com' }],
        on_success: true,
        on_failure: false,
      },
    });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'text')
    );
    assert.ok(output.includes('Notifications:'), 'Should show notifications');
    assert.ok(output.includes('slack'), 'Should show channel type');
  });

  it('handles empty configs array', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([], 'darwin', 'text')
    );
    assert.ok(output.includes('0 task(s) would be installed'), 'Should show 0 tasks');
  });
});

describe('renderInstallPreview — json', () => {
  it('outputs valid JSON', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    assert.equal(data.dryRun, true);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].name, 'test-task');
  });

  it('includes expected structure', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    const task = data.tasks[0];
    assert.ok('files' in task, 'Should have files');
    assert.ok('nextRuns' in task, 'Should have nextRuns');
    assert.ok('script' in task, 'Should have script');
    assert.ok('warnings' in task, 'Should have warnings');
    assert.ok('summary' in data, 'Should have summary');
  });

  it('has no ANSI codes in JSON output', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'json')
    );
    // ANSI escape codes start with \x1b[
    assert.ok(!output.includes('\x1b['), 'JSON output should have no ANSI codes');
  });

  it('includes summary with counts', async () => {
    const config1 = minimalConfig({ name: 'task-1' });
    const config2 = minimalConfig({ name: 'task-2', enabled: false });
    const output = await captureOutput(() =>
      renderInstallPreview([config1, config2], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    assert.equal(data.summary.wouldInstall, 1);
    assert.equal(data.summary.skipped, 1);
  });

  it('handles multiple tasks in JSON output', async () => {
    const config1 = minimalConfig({ name: 'task-1' });
    const config2 = minimalConfig({ name: 'task-2' });
    const output = await captureOutput(() =>
      renderInstallPreview([config1, config2], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    assert.equal(data.tasks.length, 2);
    assert.equal(data.tasks[0].name, 'task-1');
    assert.equal(data.tasks[1].name, 'task-2');
  });

  it('includes task metadata in JSON', async () => {
    const config = minimalConfig({
      env: { FOO: 'bar' },
      working_dir: '/tmp/test',
      interactive: [{ program: 'expect', inputs: ['yes'] }],
    });
    const output = await captureOutput(() =>
      renderInstallPreview([config], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    const task = data.tasks[0];
    assert.equal(task.workingDir, '/tmp/test');
    assert.equal(task.envVars, 1);
    assert.equal(task.commandCount, 1);
    assert.equal(task.interactive.length, 1);
  });
});

describe('renderRunPreview', () => {
  let tmpDir;
  let scriptPath;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `autoshell-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    scriptPath = join(tmpDir, 'test-task.sh');
    writeFileSync(scriptPath, '#!/bin/bash\necho hello\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows task info in text mode', async () => {
    const meta = {
      name: 'test-task', taskId: 'test-task',
      schedule: { type: 'daily', time: '09:00' },
      scriptPath, working_dir: null,
      commands: ['echo hello'], interactive: [],
    };
    const output = await captureOutput(() => renderRunPreview(meta, 'text'));
    assert.ok(output.includes('test-task'), 'Should show task name');
    assert.ok(output.includes('run preview'), 'Should indicate run preview');
  });

  it('outputs valid JSON in json mode', async () => {
    const meta = {
      name: 'test-task', taskId: 'test-task',
      schedule: { type: 'daily', time: '09:00' },
      scriptPath, working_dir: null,
      commands: ['echo hello'], interactive: [],
    };
    const output = await captureOutput(() => renderRunPreview(meta, 'json'));
    const data = JSON.parse(output);
    assert.equal(data.dryRun, true);
    assert.equal(data.task.name, 'test-task');
  });

  it('warns about missing script file', async () => {
    const meta = {
      name: 'test-task', taskId: 'test-task',
      schedule: { type: 'daily', time: '09:00' },
      scriptPath: '/nonexistent/path/script.sh',
      working_dir: null, commands: ['echo hello'], interactive: [],
    };
    const output = await captureOutput(() => renderRunPreview(meta, 'json'));
    const data = JSON.parse(output);
    assert.ok(data.task.warnings.some((w) => w.includes('not found')));
  });
});

describe('renderInstallPreview — platform-specific paths', () => {
  it('generates .sh script path for darwin', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.script.endsWith('.sh'), 'Should use .sh for darwin');
  });

  it('generates .sh script path for linux', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'linux', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.script.endsWith('.sh'), 'Should use .sh for linux');
  });

  it('generates .bat script path for win32', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'win32', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.script.endsWith('.bat'), 'Should use .bat for win32');
  });

  it('generates darwin LaunchAgents path', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'darwin', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.scheduler.includes('LaunchAgents'), 'Should include LaunchAgents');
    assert.ok(data.tasks[0].files.scheduler.includes('.plist'), 'Should end with .plist');
  });

  it('generates linux systemd path', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'linux', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.scheduler.includes('systemd'), 'Should include systemd');
    assert.ok(data.tasks[0].files.scheduler.includes('.timer'), 'Should end with .timer');
  });

  it('generates windows Task Scheduler path', async () => {
    const output = await captureOutput(() =>
      renderInstallPreview([minimalConfig()], 'win32', 'json')
    );
    const data = JSON.parse(output);
    assert.ok(data.tasks[0].files.scheduler.includes('Task Scheduler'), 'Should mention Task Scheduler');
    assert.ok(data.tasks[0].files.scheduler.includes('AutoShell_'), 'Should include AutoShell prefix');
  });
});

describe('renderJson', () => {
  it('outputs valid JSON with proper formatting', () => {
    const data = { test: 'value', nested: { key: 123 } };
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    renderJson(data);
    console.log = orig;
    const output = lines.join('\n');
    const parsed = JSON.parse(output);
    assert.deepEqual(parsed, data);
  });

  it('handles arrays in JSON output', () => {
    const data = { items: [1, 2, 3], names: ['a', 'b'] };
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    renderJson(data);
    console.log = orig;
    const output = lines.join('\n');
    const parsed = JSON.parse(output);
    assert.deepEqual(parsed.items, [1, 2, 3]);
    assert.deepEqual(parsed.names, ['a', 'b']);
  });

  it('handles null values in JSON output', () => {
    const data = { a: null, b: 'value' };
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    renderJson(data);
    console.log = orig;
    const output = lines.join('\n');
    const parsed = JSON.parse(output);
    assert.equal(parsed.a, null);
    assert.equal(parsed.b, 'value');
  });

  it('escapes special characters in strings', () => {
    const data = { message: 'line1\nline2\ttab"quote' };
    const lines = [];
    const orig = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    renderJson(data);
    console.log = orig;
    const output = lines.join('\n');
    const parsed = JSON.parse(output);
    assert.equal(parsed.message, 'line1\nline2\ttab"quote');
  });
});

describe('collectWarnings', () => {
  it('warns about non-existent working_dir', async () => {
    const warnings = await collectWarnings({ working_dir: '/nonexistent/path/xyz' });
    assert.ok(warnings.some((w) => w.includes('does not exist')));
  });

  it('returns empty for valid working_dir', async () => {
    const warnings = await collectWarnings({ working_dir: tmpdir() });
    const dirWarnings = warnings.filter((w) => w.includes('does not exist'));
    assert.equal(dirWarnings.length, 0);
  });

  it('returns empty for no working_dir', async () => {
    const warnings = await collectWarnings({});
    assert.equal(warnings.length, 0);
  });

  it('expands ~ in working_dir before checking', async () => {
    // This test verifies that ~ gets expanded to home dir
    const warnings = await collectWarnings({ working_dir: '~/nonexistent-xyz' });
    assert.ok(warnings.some((w) => w.includes('does not exist')), 'Should expand ~ and check existence');
  });

  it('warns about missing interactive programs', async () => {
    const warnings = await collectWarnings({
      interactive: [{ program: 'nonexistent-program-xyz-123' }],
    });
    assert.ok(warnings.some((w) => w.includes('not found in PATH')));
  });

  it('handles interactive block without warnings for available programs', async () => {
    const warnings = await collectWarnings({
      interactive: [{ program: 'sh' }], // sh is always available
    });
    const progWarnings = warnings.filter((w) => w.includes('not found in PATH'));
    assert.equal(progWarnings.length, 0);
  });

  it('accumulates multiple warnings', async () => {
    const warnings = await collectWarnings({
      working_dir: '/nonexistent/xyz',
      interactive: [{ program: 'nonexistent-prog-xyz' }],
    });
    assert.ok(warnings.length >= 2, 'Should accumulate multiple warnings');
  });
});
