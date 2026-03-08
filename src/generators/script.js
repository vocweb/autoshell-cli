/**
 * Script generator for AutoShell.
 *
 * Generates executable shell scripts from parsed config records.
 * - Bash scripts for macOS/Linux (strict mode, expect fallback)
 * - Bat scripts for Windows (CRLF, errorlevel checking)
 */

/**
 * Generate an executable script string from a config record.
 *
 * @param {object} record - Parsed and validated config record.
 * @param {string} platform - Target platform: 'darwin', 'linux', or 'win32'.
 * @returns {string} Script content ready to write to file.
 */
export function generateScript(record, platform) {
  if (platform === 'win32') {
    return generateBat(record);
  }
  return generateBash(record);
}

/**
 * Generate a Bash script (macOS/Linux).
 *
 * Features:
 * - set -euo pipefail (strict mode)
 * - log() helper with HH:MM:SS timestamps
 * - cd with error handling (~ → $HOME)
 * - export with shell escaping
 * - interactive: expect with stdin fallback
 */
function generateBash(record) {
  const lines = [];
  const timestamp = new Date().toISOString();

  // Header
  lines.push('#!/bin/bash');
  lines.push('set -euo pipefail');
  lines.push('');
  lines.push(`# AutoShell Task: ${record.name}`);
  lines.push(`# Generated: ${timestamp}`);
  lines.push('');

  // Log helper
  lines.push('log() { echo "[$(date +%H:%M:%S)] $*"; }');
  lines.push('');

  // Working directory
  if (record.working_dir) {
    const dir = expandHomeBash(record.working_dir);
    lines.push('# Working directory');
    lines.push(`cd "${dir}" || { log "ERROR: Directory not found: ${dir}"; exit 1; }`);
    lines.push('');
  }

  // Environment variables
  if (record.env && Object.keys(record.env).length > 0) {
    lines.push('# Environment variables');
    for (const [key, value] of Object.entries(record.env)) {
      lines.push(`export ${key}="${escapeShell(String(value))}"`);
    }
    lines.push('');
  }

  // Commands
  if (record.commands && record.commands.length > 0) {
    lines.push('# Commands');
    for (const cmd of record.commands) {
      // Preserve comment lines as-is
      if (cmd.trimStart().startsWith('#')) {
        lines.push(cmd);
        continue;
      }
      lines.push(`log "Running: ${escapeShell(cmd)}"`);
      lines.push(cmd);
      lines.push('');
    }
  }

  // Interactive blocks
  if (record.interactive && record.interactive.length > 0) {
    for (const block of record.interactive) {
      lines.push(`# Interactive: ${block.program}`);
      lines.push(...generateBashInteractive(block));
      lines.push('');
    }
  }

  // Completion
  lines.push('log "Task completed successfully"');
  lines.push('exit 0');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate Bash interactive section using expect with stdin fallback.
 */
function generateBashInteractive(block) {
  const lines = [];
  const inputLines = block.inputs.map((inp) => `  send "${escapeShell(inp)}\\r"`).join('\n');

  // expect approach
  lines.push('if command -v expect &>/dev/null; then');
  lines.push("  expect <<'EXPECT_SCRIPT'");
  lines.push(`  spawn ${block.program}`);

  // Auto-responses: wait for prompt → send response
  if (block.auto_responses && block.auto_responses.length > 0) {
    for (const ar of block.auto_responses) {
      lines.push(`  expect "${escapeShell(ar.prompt)}"`);
      lines.push(`  send "${escapeShell(ar.response)}\\r"`);
    }
  }

  // Scheduled inputs
  for (const inp of block.inputs) {
    lines.push(`  expect -timeout 30 -re ".+"`);
    lines.push(`  send "${escapeShell(inp)}\\r"`);
  }

  lines.push('  expect eof');
  lines.push('EXPECT_SCRIPT');

  // Fallback: stdin redirect
  lines.push('else');
  const inputStr = block.inputs.join('\n');
  lines.push(`  echo "${escapeShell(inputStr)}" | ${block.program}`);
  lines.push('fi');

  return lines;
}

/**
 * Generate a Bat script (Windows).
 *
 * Features:
 * - @echo off + setlocal EnableDelayedExpansion
 * - call prefix for each command
 * - if errorlevel 1 after each command
 * - cd /d with %USERPROFILE% for ~
 * - Interactive: temp file + input redirect
 * - CRLF line endings
 */
function generateBat(record) {
  const lines = [];
  const timestamp = new Date().toISOString();

  // Header
  lines.push('@echo off');
  lines.push('setlocal EnableDelayedExpansion');
  lines.push('');
  lines.push(`REM AutoShell Task: ${record.name}`);
  lines.push(`REM Generated: ${timestamp}`);
  lines.push('');

  // Working directory
  if (record.working_dir) {
    const dir = expandHomeWindows(record.working_dir);
    lines.push('REM Working directory');
    lines.push(`cd /d "${dir}"`);
    lines.push('if errorlevel 1 (echo ERROR: Directory not found & exit /b 1)');
    lines.push('');
  }

  // Environment variables
  if (record.env && Object.keys(record.env).length > 0) {
    lines.push('REM Environment variables');
    for (const [key, value] of Object.entries(record.env)) {
      lines.push(`set "${key}=${String(value)}"`);
    }
    lines.push('');
  }

  // Commands
  if (record.commands && record.commands.length > 0) {
    lines.push('REM Commands');
    for (const cmd of record.commands) {
      // Preserve comment lines
      if (cmd.trimStart().startsWith('#') || cmd.trimStart().startsWith('REM')) {
        lines.push(`REM ${cmd.replace(/^#\s*/, '')}`);
        continue;
      }
      lines.push(`echo [%TIME%] Running: ${cmd}`);
      lines.push(`call ${cmd}`);
      lines.push('if errorlevel 1 (echo ERROR: Command failed & exit /b 1)');
      lines.push('');
    }
  }

  // Interactive blocks
  if (record.interactive && record.interactive.length > 0) {
    for (const block of record.interactive) {
      lines.push(`REM Interactive: ${block.program}`);
      lines.push(...generateBatInteractive(block));
      lines.push('');
    }
  }

  // Completion
  lines.push('echo [%TIME%] Task completed successfully');
  lines.push('endlocal');
  lines.push('exit /b 0');
  lines.push('');

  // Convert to CRLF
  return lines.join('\r\n');
}

/**
 * Generate Bat interactive section using temp file + input redirect.
 */
function generateBatInteractive(block) {
  const lines = [];
  const tempFile = '%TEMP%\\autoshell_input.tmp';

  // Write inputs to temp file
  for (let i = 0; i < block.inputs.length; i++) {
    const op = i === 0 ? '>' : '>>';
    lines.push(`echo ${block.inputs[i]} ${op} ${tempFile}`);
  }

  // Pipe temp file into program
  lines.push(`${block.program} < ${tempFile}`);
  lines.push(`del ${tempFile}`);

  return lines;
}

/**
 * Replace ~ with $HOME for Bash scripts.
 * Non-interactive shells don't expand ~ automatically.
 */
function expandHomeBash(path) {
  return path.replace(/^~(?=\/|$)/, '$HOME');
}

/**
 * Replace ~ with %USERPROFILE% for Windows scripts.
 */
function expandHomeWindows(path) {
  return path.replace(/^~(?=\/|\\|$)/, '%USERPROFILE%').replace(/\//g, '\\');
}

/**
 * Escape special characters for shell strings (double-quoted context).
 */
function escapeShell(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
