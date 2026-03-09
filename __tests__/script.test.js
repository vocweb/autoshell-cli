/**
 * Tests for script generator.
 * Covers Bash and Bat generation including headers, commands,
 * env vars, working dirs, interactive blocks, and line endings.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateScript } from '../src/generators/script.js';

// -- Helper: minimal record --
const minimal = (overrides = {}) => ({
  name: 'Test Task',
  schedule: { type: 'daily', time: '09:00' },
  commands: ['echo hello'],
  ...overrides,
});

describe('generateScript — Bash', () => {
  it('includes shebang and strict mode header', () => {
    const script = generateScript(minimal(), 'darwin');
    assert.ok(script.startsWith('#!/bin/bash'));
    assert.ok(script.includes('set -euo pipefail'));
  });

  it('includes task name in header comment', () => {
    const script = generateScript(minimal({ name: 'My Build' }), 'linux');
    assert.ok(script.includes('# AutoShell Task: My Build'));
  });

  it('includes log helper function', () => {
    const script = generateScript(minimal(), 'darwin');
    assert.ok(script.includes('log() { echo "[$(date +%H:%M:%S)] $*"; }'));
  });

  it('generates commands with log prefix', () => {
    const script = generateScript(minimal({ commands: ['npm ci', 'npm run build'] }), 'darwin');
    assert.ok(script.includes('log "Running: npm ci"'));
    assert.ok(script.includes('npm ci'));
    assert.ok(script.includes('npm run build'));
  });

  it('generates working directory with $HOME expansion', () => {
    const script = generateScript(minimal({ working_dir: '~/projects/app' }), 'darwin');
    assert.ok(script.includes('cd "$HOME/projects/app"'));
    assert.ok(script.includes('ERROR: Directory not found'));
  });

  it('generates env var exports with escaping', () => {
    const script = generateScript(minimal({ env: { NODE_ENV: 'production', KEY: 'val"ue' } }), 'darwin');
    assert.ok(script.includes('export NODE_ENV="production"'));
    assert.ok(script.includes('export KEY="val\\"ue"'));
  });

  it('generates interactive expect block with fallback', () => {
    const record = minimal({
      interactive: [{
        program: 'claude',
        inputs: ['/help', '/quit'],
      }],
    });
    const script = generateScript(record, 'darwin');
    // Resolves program path before expect (launchd PATH fix)
    assert.ok(script.includes('_PROG_PATH="$(command -v claude'));
    assert.ok(script.includes('if command -v expect &>/dev/null; then'));
    assert.ok(script.includes('_EXPECT_SCRIPT="$(mktemp /tmp/autoshell_expect_XXXXXX.exp)"'));
    // spawn line uses printf with resolved path
    assert.ok(script.includes("printf 'spawn %s\\n' \"$_PROG_PATH\""));
    assert.ok(script.includes('send "/help"'));
    assert.ok(script.includes('send "/quit"'));
    assert.ok(script.includes('send "\\r"'));
    // Waits for output to settle before sending input
    assert.ok(script.includes('exp_continue'));
    assert.ok(script.includes('interact'));
    assert.ok(script.includes('expect -f "$_EXPECT_SCRIPT"'));
    assert.ok(script.includes('else'));
    // Fallback uses sleep for initialization + process substitution
    assert.ok(script.includes('< <(sleep 5; echo'));
    assert.ok(script.includes('fi'));
  });

  it('generates interactive auto_responses', () => {
    const record = minimal({
      interactive: [{
        program: 'claude',
        inputs: ['/help'],
        auto_responses: [
          { prompt: 'Allow access', response: 'yes' },
        ],
      }],
    });
    const script = generateScript(record, 'darwin');
    assert.ok(script.includes('expect "Allow access"'));
    assert.ok(script.includes('send "yes\\r"'));
  });

  it('preserves comment lines in commands', () => {
    const script = generateScript(minimal({ commands: ['# Setup', 'npm ci'] }), 'darwin');
    assert.ok(script.includes('# Setup'));
    // Comment lines should not have log prefix
    assert.ok(!script.includes('log "Running: # Setup"'));
  });

  it('ends with completion message and exit 0', () => {
    const script = generateScript(minimal(), 'darwin');
    assert.ok(script.includes('log "Task completed successfully"'));
    assert.ok(script.includes('exit 0'));
  });

  it('uses LF line endings', () => {
    const script = generateScript(minimal(), 'linux');
    assert.ok(!script.includes('\r\n'));
  });
});

describe('generateScript — Bat', () => {
  it('includes @echo off and setlocal header', () => {
    const script = generateScript(minimal(), 'win32');
    assert.ok(script.includes('@echo off'));
    assert.ok(script.includes('setlocal EnableDelayedExpansion'));
  });

  it('includes task name in REM comment', () => {
    const script = generateScript(minimal({ name: 'Deploy' }), 'win32');
    assert.ok(script.includes('REM AutoShell Task: Deploy'));
  });

  it('generates commands with call prefix and error check', () => {
    const script = generateScript(minimal({ commands: ['npm ci'] }), 'win32');
    assert.ok(script.includes('call npm ci'));
    assert.ok(script.includes('if errorlevel 1'));
  });

  it('generates working dir with %USERPROFILE% and backslashes', () => {
    const script = generateScript(minimal({ working_dir: '~/projects/app' }), 'win32');
    assert.ok(script.includes('cd /d "%USERPROFILE%\\projects\\app"'));
  });

  it('generates env vars with set command', () => {
    const script = generateScript(minimal({ env: { NODE_ENV: 'production' } }), 'win32');
    assert.ok(script.includes('set "NODE_ENV=production"'));
  });

  it('generates interactive with temp file approach', () => {
    const record = minimal({
      interactive: [{
        program: 'claude',
        inputs: ['/help', '/quit'],
      }],
    });
    const script = generateScript(record, 'win32');
    assert.ok(script.includes('autoshell_input.tmp'));
    assert.ok(script.includes('echo /help'));
    assert.ok(script.includes('echo /quit'));
    assert.ok(script.includes('claude < '));
    assert.ok(script.includes('del '));
  });

  it('uses CRLF line endings', () => {
    const script = generateScript(minimal(), 'win32');
    assert.ok(script.includes('\r\n'));
  });

  it('ends with endlocal and exit /b 0', () => {
    const script = generateScript(minimal(), 'win32');
    assert.ok(script.includes('endlocal'));
    assert.ok(script.includes('exit /b 0'));
  });
});
