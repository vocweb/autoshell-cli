/**
 * Tests for task logger and log rotator.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdirSync, writeFileSync, utimesSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { TaskLogger } from '../src/logging/task-logger.js';
import { parseSize, rotateTaskLogs } from '../src/logging/log-rotator.js';

// Each test uses a unique temp dir to avoid conflicts
function uniqueDir() {
  const dir = join(tmpdir(), `autoshell-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('TaskLogger', () => {
  it('creates a log file when enabled', async () => {
    const dir = uniqueDir();
    const logger = new TaskLogger('test-task', { enabled: true, dir });
    assert.ok(logger.getLogPath());
    assert.ok(logger.getLogPath().includes('test-task'));
    await logger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes stdout lines with timestamp and channel', async () => {
    const dir = uniqueDir();
    const logger = new TaskLogger('test-task', { enabled: true, dir });
    logger.writeStdout('hello world');
    await logger.close();

    const content = readFileSync(logger.getLogPath(), 'utf-8');
    assert.ok(content.includes('[stdout] hello world'));
    assert.match(content, /\[\d{2}:\d{2}:\d{2}\]/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes stderr lines with stderr channel', async () => {
    const dir = uniqueDir();
    const logger = new TaskLogger('test-task', { enabled: true, dir });
    logger.writeStderr('error occurred');
    await logger.close();

    const content = readFileSync(logger.getLogPath(), 'utf-8');
    assert.ok(content.includes('[stderr] error occurred'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when disabled', async () => {
    const logger = new TaskLogger('test-task', { enabled: false });
    logger.writeStdout('hello');
    assert.equal(logger.getLogPath(), null);
    await logger.close();
  });

  it('defaults to enabled', async () => {
    const dir = uniqueDir();
    const logger = new TaskLogger('test-task', { dir });
    assert.ok(logger.getLogPath());
    await logger.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('parseSize', () => {
  it('parses KB', () => {
    assert.equal(parseSize('500KB'), 500 * 1024);
  });

  it('parses MB', () => {
    assert.equal(parseSize('10MB'), 10 * 1024 * 1024);
  });

  it('parses GB', () => {
    assert.equal(parseSize('1GB'), 1024 * 1024 * 1024);
  });

  it('is case insensitive', () => {
    assert.equal(parseSize('10mb'), 10 * 1024 * 1024);
  });

  it('returns default 10MB for invalid input', () => {
    assert.equal(parseSize('invalid'), 10 * 1024 * 1024);
  });
});

describe('rotateTaskLogs', () => {
  it('deletes logs older than retention days', async () => {
    const dir = uniqueDir();
    const taskId = 'rotation-test';
    const logDir = join(dir, taskId);
    mkdirSync(logDir, { recursive: true });

    // Create an old log file (8 days ago)
    const oldFile = join(logDir, 'old.log');
    writeFileSync(oldFile, 'old log content');
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;
    utimesSync(oldFile, new Date(oldTime), new Date(oldTime));

    // Create a recent log file
    const newFile = join(logDir, 'new.log');
    writeFileSync(newFile, 'new log content');

    // Temporarily override paths.logs
    const pathsMod = await import('../src/utils/paths.js');
    const origLogs = pathsMod.paths.logs;
    pathsMod.paths.logs = dir;

    await rotateTaskLogs(taskId, { retention: 7, max_size: '100MB' });

    pathsMod.paths.logs = origLogs;

    assert.equal(existsSync(oldFile), false, 'Old log should be deleted');
    assert.equal(existsSync(newFile), true, 'New log should remain');
    rmSync(dir, { recursive: true, force: true });
  });
});
