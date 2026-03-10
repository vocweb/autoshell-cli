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
 * Generate a Bash script for macOS/Linux.
 *
 * Features:
 * - set -euo pipefail (strict mode)
 * - log() helper with HH:MM:SS timestamps
 * - cd with error handling (~ → $HOME)
 * - export with shell escaping
 * - interactive: expect with stdin fallback
 *
 * @param {object} record - Parsed and validated config record.
 * @returns {string} Bash script content as a string.
 */
function generateBash(record) {
  const lines = [];
  const timestamp = new Date().toISOString();

  // Header
  lines.push('#!/bin/bash');
  lines.push('');
  lines.push(`# AutoShell Task: ${record.name}`);
  lines.push(`# Generated: ${timestamp}`);
  lines.push('');
  lines.push('# Ensure valid CWD before strict mode (launchd may start in protected dir)');
  lines.push('cd "$HOME" 2>/dev/null || true');
  lines.push('');
  lines.push('# Source user profile to inherit PATH (launchd/systemd may not load shell profiles)');
  lines.push('for f in "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.zprofile" "$HOME/.zshrc"; do');
  lines.push('  [ -f "$f" ] && source "$f" 2>/dev/null || true');
  lines.push('done');
  lines.push('');
  lines.push('set -euo pipefail');
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
 * Generate Bash lines for an interactive program block using expect with stdin fallback.
 *
 * Uses a temp expect file (not heredoc) so `interact` can work —
 * heredoc redirects stdin away from the terminal, preventing user interaction.
 * Fallback uses process substitution `< <(sleep; echo; cat)` to keep stdin open.
 *
 * Key design decisions:
 * - Resolve program full path via `command -v` before expect (launchd/systemd
 *   may not have user PATH; profiles may skip PATH setup for non-interactive shells)
 * - Use printf for spawn line (needs resolved path), heredoc for rest (literal Tcl)
 * - Wait for program output to settle (3s silence) before sending input,
 *   instead of matching first output which fires too early for TUI apps
 *
 * @param {object} block - Interactive program block from the config record.
 * @param {string} block.program - Program name to spawn.
 * @param {string[]} [block.args] - Arguments to pass to the program.
 * @param {string[]} block.inputs - Text inputs to send after program starts.
 * @param {Array<{prompt: string, response: string}>} [block.auto_responses] - Prompt/response pairs.
 * @returns {string[]} Array of Bash script lines for this interactive block.
 */
function generateBashInteractive(block) {
  const lines = [];
  // Quote each arg with Tcl curly braces for expect spawn context
  const spawnArgs = block.args && block.args.length > 0
    ? ' ' + block.args.map((a) => `{${a}}`).join(' ')
    : '';
  const fallbackArgs = block.args && block.args.length > 0 ? ' ' + block.args.join(' ') : '';

  // Resolve program full path — profiles may not load in launchd/expect context
  lines.push(`_PROG_PATH="$(command -v ${block.program} 2>/dev/null || which ${block.program} 2>/dev/null || echo ${block.program})"`);

  // expect approach — temp file enables `interact` (heredoc breaks it)
  lines.push('if command -v expect &>/dev/null; then');
  lines.push('  _EXPECT_SCRIPT="$(mktemp /tmp/autoshell_expect_XXXXXX.exp)"');
  lines.push('  trap \'rm -f "$_EXPECT_SCRIPT"\' EXIT INT TERM');

  // Write expect script: spawn line uses resolved path (printf), rest is literal Tcl
  lines.push('  (umask 077;');
  lines.push(`    printf 'spawn %s${spawnArgs}\\n' "$_PROG_PATH" > "$_EXPECT_SCRIPT"`);
  lines.push("    cat >> \"$_EXPECT_SCRIPT\" <<'EXPECT_SCRIPT'");

  // Auto-responses: wait for prompt → send response
  if (block.auto_responses && block.auto_responses.length > 0) {
    for (const ar of block.auto_responses) {
      lines.push(`expect "${escapeShell(ar.prompt)}"`);
      lines.push(`send "${escapeShell(ar.response)}\\r"`);
    }
  }

  // Wait for program output to settle (3s of silence = initialization complete)
  // This prevents sending input while TUI apps are still rendering startup UI
  lines.push('set timeout 3');
  lines.push('expect {');
  lines.push('  -re ".+" { exp_continue }');
  lines.push('  timeout { }');
  lines.push('}');

  // Send scheduled inputs — split text and Enter to give TUI apps time to process
  for (let i = 0; i < block.inputs.length; i++) {
    lines.push(`send "${escapeShell(block.inputs[i])}"`);
    lines.push('sleep 0.5');
    lines.push('send "\\r"');
    // Wait for output to settle between inputs (skip after last)
    if (i < block.inputs.length - 1) {
      lines.push('set timeout 3');
      lines.push('expect {');
      lines.push('  -re ".+" { exp_continue }');
      lines.push('  timeout { }');
      lines.push('}');
    }
  }

  // interact hands control to user — program stays alive
  lines.push('interact');
  lines.push('EXPECT_SCRIPT');
  lines.push('  )');
  lines.push('  (set +e; expect -f "$_EXPECT_SCRIPT"; _EC=$?; rm -f "$_EXPECT_SCRIPT"; exit $_EC)');

  // Fallback: no expect — process substitution keeps stdin open
  // sleep 5 gives program time to initialize before receiving input
  lines.push('else');
  const inputStr = block.inputs.join('\\n');
  lines.push(`  "$_PROG_PATH"${fallbackArgs} < <(sleep 5; echo -e "${escapeShell(inputStr)}"; cat)`);
  lines.push('fi');

  return lines;
}

/**
 * Generate a Windows Batch (.bat) script.
 *
 * Features:
 * - @echo off + setlocal EnableDelayedExpansion
 * - call prefix for each command
 * - if errorlevel 1 after each command
 * - cd /d with %USERPROFILE% for ~
 * - Interactive: temp file + input redirect
 * - CRLF line endings (\r\n)
 *
 * @param {object} record - Parsed and validated config record.
 * @returns {string} Batch script content with CRLF line endings.
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
  lines.push('REM Ensure valid CWD (schtasks may start in system directory)');
  lines.push('cd /d "%USERPROFILE%" 2>nul');
  lines.push('');
  lines.push('REM Refresh PATH from registry (schtasks may not inherit full user PATH)');
  lines.push('for /f "tokens=2*" %%A in (\'reg query "HKCU\\Environment" /v PATH 2^>nul\') do set "PATH=%%B;%PATH%"');
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
 * Generate Batch lines for an interactive program block.
 * Writes all inputs to a temp file then redirects it into the program's stdin.
 * Unlike Bash's expect approach, Windows has no native PTY automation tool,
 * so stdin redirection is the best cross-machine option.
 *
 * @param {object} block - Interactive program block from the config record.
 * @param {string} block.program - Program executable name.
 * @param {string[]} [block.args] - Arguments to pass to the program.
 * @param {string[]} block.inputs - Text inputs to send to the program.
 * @returns {string[]} Array of Batch script lines for this interactive block.
 */
function generateBatInteractive(block) {
  const lines = [];
  const tempFile = '%TEMP%\\autoshell_input.tmp';

  // Write inputs to temp file (split multiline inputs into separate echo lines)
  let isFirst = true;
  for (const input of block.inputs) {
    const inputLines = input.split('\n');
    for (const line of inputLines) {
      const op = isFirst ? '>' : '>>';
      lines.push(`echo ${escapeBat(line)} ${op} ${tempFile}`);
      isFirst = false;
    }
  }

  // Pipe temp file into program
  const batArgs = block.args && block.args.length > 0 ? ' ' + block.args.join(' ') : '';
  lines.push(`${block.program}${batArgs} < ${tempFile}`);
  lines.push(`del ${tempFile}`);

  return lines;
}

/**
 * Replace a leading ~ with $HOME for use in Bash scripts.
 * Non-interactive shells (launchd, systemd) don't expand ~ automatically,
 * so the substitution must happen in the generated script itself.
 *
 * @param {string} path - Directory path, possibly starting with ~.
 * @returns {string} Path with ~ replaced by $HOME.
 */
function expandHomeBash(path) {
  return path.replace(/^~(?=\/|$)/, '$HOME');
}

/**
 * Replace a leading ~ with %USERPROFILE% and normalize slashes for Windows Batch scripts.
 * schtasks may not expand ~ and uses backslashes as the path separator.
 *
 * @param {string} path - Directory path, possibly starting with ~.
 * @returns {string} Windows-normalized path with %USERPROFILE% substituted.
 */
function expandHomeWindows(path) {
  return path.replace(/^~(?=\/|\\|$)/, '%USERPROFILE%').replace(/\//g, '\\');
}

/**
 * Escape special Batch metacharacters for use in echo statements.
 * Escapes: % → %%, and & | < > ^ → ^& ^| ^< ^> ^^
 *
 * @param {string} str - Input string.
 * @returns {string} Escaped string safe for Batch echo commands.
 */
function escapeBat(str) {
  // Escape Bat special characters: & | < > ^ %
  return str.replace(/%/g, '%%').replace(/([&|<>^])/g, '^$1');
}

/**
 * Escape special characters for use inside double-quoted Bash strings.
 * Escapes: backslash, double-quote, $, backtick, newline, carriage return.
 *
 * @param {string} str - Input string.
 * @returns {string} Escaped string safe for Bash double-quoted contexts.
 */
function escapeShell(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
