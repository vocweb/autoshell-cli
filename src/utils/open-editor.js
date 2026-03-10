/**
 * Cross-platform file opener for AutoShell.
 *
 * Opens a file in the user's preferred editor using this fallback chain:
 * 1. $VISUAL environment variable (GUI editors like VS Code, Zed)
 * 2. $EDITOR environment variable (terminal editors like vim, nano)
 * 3. Platform default: `open` (macOS), `xdg-open` (Linux), `start` (Windows)
 *
 * The editor process is detached — this function returns immediately
 * without waiting for the editor to close.
 */

import { spawn } from 'node:child_process';
import { getPlatform } from './platform.js';

/**
 * Open a file in the user's preferred editor.
 *
 * Fire-and-forget: spawns the editor process detached so the CLI can exit
 * immediately. Spawn errors are logged to stderr but do not throw — the file
 * has already been saved successfully at this point.
 *
 * @param {string} filePath - Absolute path to the file to open.
 */
export function openInEditor(filePath) {
  const { command, args } = resolveEditorCommand(filePath);

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    // `start` on Windows is a shell built-in, requires shell: true
    shell: getPlatform() === 'win32',
  });

  // Detach so Node.js can exit without waiting for the editor
  child.unref();

  child.on('error', (err) => {
    // Non-fatal: file is already saved; just warn the user
    process.stderr.write(
      `Warning: could not open editor "${command}": ${err.message}\n`,
    );
  });
}

/**
 * Resolve which editor command and arguments to use for a given file path.
 *
 * Fallback chain:
 * 1. $VISUAL  — preferred for GUI editors (e.g. `code`, `zed`)
 * 2. $EDITOR  — preferred for terminal editors (e.g. `vim`, `nano`)
 * 3. Platform default opener
 *
 * Note: $VISUAL / $EDITOR should be a single executable path.
 * Multi-word values like `code --wait` are not supported; set $VISUAL=code instead.
 *
 * @param {string} filePath - File to open.
 * @returns {{ command: string, args: string[] }}
 */
function resolveEditorCommand(filePath) {
  // Check $VISUAL first (GUI editors take priority)
  if (process.env.VISUAL) {
    return { command: process.env.VISUAL, args: [filePath] };
  }

  // Check $EDITOR (common on Unix systems)
  if (process.env.EDITOR) {
    return { command: process.env.EDITOR, args: [filePath] };
  }

  // Fall back to platform-specific default opener
  const platform = getPlatform();
  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [filePath] };
    case 'win32':
      // `start ""` opens with the default associated application
      return { command: 'start', args: ['""', filePath] };
    default:
      // Linux and other Unix-like systems
      return { command: 'xdg-open', args: [filePath] };
  }
}
